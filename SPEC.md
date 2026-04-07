# SPEC: Custom Metadata Support for `mcp-server-devonthink`

**Repo:** `dvcrn/mcp-server-devonthink` (TypeScript, JXA-based, v1.9.0 at time of writing) **Goal:** Make DEVONthink
user-defined custom metadata fields readable, writable, discoverable, and searchable through the MCP, so downstream
skills can treat custom metadata as first-class document data.

---

## Background

DEVONthink supports user-defined custom metadata fields (Preferences → Data → Metadata). Each field has an internal key,
a display name, a type (text, date, integer, decimal, boolean, set/enum, URL, rich text, etc.), and — for `set` type
fields — a list of allowed values. Internally, AppleScript exposes these on every record via the `custom meta data`
property as a record/dictionary.

Two quirks worth knowing up front:

1. **The `md` prefix.** When you read/write via AppleScript, keys are namespaced with an `md` prefix in lowercase (e.g.,
   a field whose display name is "Citekey" is accessed as `mdcitekey`). The MCP should hide this prefix from callers and
   translate at the JXA boundary.

2. **Display name vs. internal key.** Display names can have spaces, capitals, and punctuation; internal keys are
   lowercase, alphanumeric, no spaces. A field labeled "Annual Report Year" becomes something like `mdannualreportyear`.
   The mapping is not always mechanical (DEVONthink may collapse or rename), so the MCP should not try to derive one
   from the other — it should ask DEVONthink directly via `get custom meta data` and `add custom meta data` calls.

The current MCP server (v1.9.0) does not touch custom metadata anywhere. `src/tools/getRecordProperties.ts` builds its
JXA `properties` object from a fixed list of standard fields and stops there. `src/tools/setRecordProperties.ts` allows
writing `comment`, `flag`, `locked`, and the various `excludeFrom*` flags but nothing custom.
`src/tools/lookupRecord.ts` supports `filename | path | url | tags | comment | contentHash` and that's it.

This spec closes that gap.

## Scope

In scope for v1 of this change:

- **Read** custom metadata in `get_record_properties` responses.
- **Write** custom metadata via `set_record_properties` (extending the existing tool, not adding a new one).
- **Discover** the custom metadata schema for a database via a new `get_custom_metadata_schema` tool.
- **Search** by custom metadata field value via a new `customMetadata` lookup type in `lookup_record`.

Out of scope for v1:

- Creating or modifying the custom metadata field definitions themselves (DEVONthink's AppleScript surface for this is
  limited; users still configure fields in Preferences).
- Bulk metadata operations across many records in one call.
- Custom metadata on groups (only standard records). Groups can technically hold custom metadata in DEVONthink, but no
  skills currently need it; we can revisit.

## Conventions

- All custom metadata keys exposed at the MCP boundary use the **display name** form, lowercased and stripped of
  non-alphanumerics, matching DEVONthink's internal key minus the `md` prefix. So "Annual Report Year" →
  `annualreportyear` at the API, `mdannualreportyear` inside the JXA call.
- The MCP **accepts** either form on input (`citekey`, `mdcitekey`) and normalizes internally.
- Date values are serialized to ISO 8601 strings (`YYYY-MM-DD` for date-only, full ISO for datetimes), not JXA `Date`
  objects. There is a known JXA gotcha where `Date` objects round-trip badly through `JSON.stringify` — see
  `src/applescript/execute.ts` for how the existing code handles other dates and follow that pattern. (Possibly relevant
  to a separate bug observed in production: a `datePublished` field showing `12/31/2000` on a 2024 document, suggesting
  the AppleScript bridge or the import path is dropping or defaulting dates somewhere. Worth investigating as a side
  quest while you're in the code.)
- Empty / unset fields are **omitted** from the response, not returned as `null` or `""`. This keeps the payload small
  and lets callers distinguish "field doesn't exist" from "field is empty" (the answer is the same: it's not in the
  dict).
- Errors on a single field (unknown key, type mismatch on write) do not abort the whole call; they go into `skipped`
  with a reason, matching the existing `setRecordProperties` pattern.

---

## Change 1: Read custom metadata in `get_record_properties`

**File:** `src/tools/getRecordProperties.ts`

**Type changes:** Add `customMetadata?: Record<string, string | number | boolean>` to the `RecordProperties` interface.
(Values are heterogeneous because DEVONthink fields can be text, integer, decimal, boolean, or date-as-ISO-string. A
discriminated union would be more correct but adds friction with no real benefit for callers.)

**JXA changes:** Inside the `properties` builder, after the existing `characterCount` line, add a block that reads
`targetRecord.customMetaData()` and converts it to a plain object:

```js
// Custom metadata
try {
  const cmdRaw = targetRecord.customMetaData();
  if (cmdRaw && typeof cmdRaw === "object") {
    const cmd = {};
    // JXA returns this as an Object whose keys are the md-prefixed internal names
    for (const k of Object.keys(cmdRaw)) {
      const value = cmdRaw[k];
      if (value === null || value === undefined || value === "") continue;
      // Strip the "md" prefix for the public API
      const publicKey = k.startsWith("md") ? k.slice(2) : k;
      // Date-like values: serialize to ISO
      if (value instanceof Date) {
        cmd[publicKey] = value.toISOString();
      } else {
        cmd[publicKey] = value;
      }
    }
    if (Object.keys(cmd).length > 0) {
      properties.customMetadata = cmd;
    }
  }
} catch (e) {
  // Field doesn't exist on this record type, or DEVONthink returned null — ignore.
}
```

Wrap it in `try/catch` because `customMetaData()` may not be defined on every record subtype (this is the same defensive
pattern used for the `excludeFrom*` flags above).

**Test:** Add a unit test in `tests/tools/` that mocks the JXA result and verifies the `md` prefix is stripped, empty
values are dropped, and dates round-trip as ISO strings. Add an integration test in
`tests/integration/identification.test.ts` that creates a record, sets a few custom metadata fields directly via
AppleScript, and verifies they come back through the tool.

---

## Change 2: Discover the custom metadata schema

**New tool:** `get_custom_metadata_schema`
**New file:** `src/tools/getCustomMetadataSchema.ts`

**Purpose:** Without this, every skill has to guess at field names, types, and allowed values. With it, a skill can
introspect a database once and work generically.

**Input schema:**

```ts
{
  databaseName: z.string().optional()  // defaults to current database
}
```

**Output:**

```ts
{
  success: boolean;
  error?: string;
  databaseName: string;
  fields: Array<{
    key: string;              // public key (no "md" prefix)
    internalKey: string;      // "md" + key, what JXA actually wants
    displayName: string;      // human-readable label from DEVONthink
    type: "text" | "richtext" | "date" | "integer" | "decimal" | "boolean" | "url" | "set" | "unknown";
    allowedValues?: string[]; // populated only for type === "set"
  }>;
}
```

**JXA implementation:** DEVONthink exposes the schema via the application-level `customMetaData` property (not the
per-record one). The exact JXA shape varies by DEVONthink version; the safe approach is:

1. Call `theApp.customMetaData()` to get the raw schema dict.
2. Iterate keys; each key is the `mdfoo` form.
3. For each key, the value is itself an object describing the field, including a `type` and (for set fields) an
   `allowedValues` or similar. Inspect this in DEVONthink's AppleScript dictionary first to confirm the exact property
   names — they have changed across DEVONthink versions.
4. Map the raw type strings to the union above, with `"unknown"` as the fallback so we don't hard-fail on a type
   DEVONthink adds later.

**Caching note:** Schema lookups are cheap but constant per database. The MCP doesn't currently cache anything and
shouldn't start here — let the caller cache if it cares. Document this in the tool description.

**Test:** Integration test only. Unit-testing the schema introspection in isolation isn't worth the mocking effort; the
value is in confirming it works against a real database.

---

## Change 3: Write custom metadata via `set_record_properties`

**File:** `src/tools/setRecordProperties.ts`

**Schema change:** Add a new optional field to `SetRecordPropertiesSchema`:

```ts
customMetadata: z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .optional()
  .describe(
    "Set custom metadata fields. Keys are field names (without 'md' prefix). " +
    "Pass null as a value to clear a field. Unknown keys go to 'skipped' in the response."
  ),
```

`null` is explicitly allowed because DEVONthink's `add custom meta data` call with an empty value is the documented way
to clear a field.

**JXA changes:** In the script body, after the existing exclusion-flag blocks, add:

```js
// Custom metadata
${
  customMetadata !== undefined
    ? `
  (function() {
    const incoming = ${JSON.stringify(customMetadata)};
    for (const rawKey of Object.keys(incoming)) {
      // Accept either "citekey" or "mdcitekey" from callers; normalize to mdcitekey for JXA.
      const key = rawKey.startsWith("md") ? rawKey : "md" + rawKey.toLowerCase();
      const value = incoming[rawKey];
      try {
        if (value === null) {
          theApp.addCustomMetaData("", { for: key.slice(2), to: rec });
        } else {
          theApp.addCustomMetaData(value, { for: key.slice(2), to: rec });
        }
        updated.push("customMetadata." + (key.startsWith("md") ? key.slice(2) : key));
      } catch (e) {
        skipped.push("customMetadata." + rawKey + ": " + e.toString());
      }
    }
  })();
`
    : ""
}
```

Two things to verify against the live AppleScript dictionary before merging:

- The exact signature of `add custom meta data` — DEVONthink wants the field name *without* the `md` prefix here, even
  though reads return it *with* the prefix. This is a real and confusing inconsistency in DEVONthink's API, not a bug in
  your code. Test it both ways and document whichever wins.
- Whether passing an empty string actually clears the field, or whether the field has to be deleted some other way. If
  empty-string doesn't clear, document that clearing isn't supported in v1 and reject `null` at the schema level.

**Validation:** Before generating the JXA script, validate that no key contains characters that would break the embedded
`JSON.stringify` (the existing `isJXASafeString` check on `databaseName` etc. is the model). For values, the
`JSON.stringify` round-trip handles escaping, but reject any value that's a function or object (Zod already does this —
the `.record()` schema above only allows scalars).

**Test:** Unit test the key-normalization logic. Integration test the full read-modify-read round trip.

---

## Change 4: Search by custom metadata in `lookup_record`

**File:** `src/tools/lookupRecord.ts`

**Schema change:** Add `"customMetadata"` to the `lookupType` enum, and add two new optional fields:

```ts
customMetadataField: z.string().optional()
  .describe("Custom metadata field name (for lookupType 'customMetadata')"),
customMetadataValue: z.union([z.string(), z.number(), z.boolean()]).optional()
  .describe("Value to match (for lookupType 'customMetadata')"),
```

Add a `.refine()` clause that requires both to be present when `lookupType === "customMetadata"`.

**JXA changes:** In the `switch` block inside the script, add a new case:

```js
case "customMetadata": {
  // DEVONthink's `search` syntax supports custom metadata via the
  // "additional metadata" search prefix, e.g.:
  //   search "additionalMetaData.mdcitekey:foo2024"
  // This is faster than walking every record manually.
  const fieldKey = "${escapeStringForJXA(customMetadataField)}";
  const internalKey = fieldKey.startsWith("md") ? fieldKey : "md" + fieldKey.toLowerCase();
  const valueStr = ${JSON.stringify(String(customMetadataValue))};
  const query = "additionalMetaData." + internalKey + ":" + valueStr;
  results = theApp.search(query, { in: targetDatabase ? targetDatabase.root() : null });
  break;
}
```

**Important:** The `additionalMetaData.` search prefix is the documented way DEVONthink lets you query custom metadata
in its search syntax, but the exact prefix has changed at least once across DEVONthink versions. Verify against your
installed version and the AppleScript dictionary before locking it in. If the prefix doesn't work or the version is old,
the fallback is to walk all records in the database and check `customMetaData()` on each — slow but reliable. Document
whichever path you take.

**Test:** Integration test that creates a few records with distinct custom metadata values and verifies the lookup
returns only the matching ones.

---

## Implementation order

Do these in order; each is independently mergeable and each unblocks the next:

1. **Change 1 (read)**. Smallest, lowest risk, immediately unblocks every read-side skill. Ship this first as its own PR
   so I can start writing skills against it while you do the rest.
2. **Change 2 (schema discovery)**. Required by any skill that wants to validate or enumerate fields. Independent of
   change 3.
3. **Change 3 (write)**. The trickiest one because of DEVONthink's `add custom meta data` quirks. Don't merge until
   you've manually verified the round-trip on at least one of each field type (text, date, integer, set, boolean).
4. **Change 4 (search)**. Nice-to-have; skills can fall back to fetch-then-filter without it. Lowest priority.

## Open questions for Andrew

These should get answered (by you or by experimenting in DEVONthink) before or during implementation, not deferred:

1. **The `12/31/2000` ghost date.** Is this DEVONthink defaulting an empty date field, or is it your import workflow
   writing a wrong value? If the former, change 1 should filter it out; if the latter, it's a separate bug. Worth
   grepping the corrections_ar2024 record to see whether the date is actually `2000-12-31` or whether something else is
   happening.
2. **Rich text fields (Abstract, metadataReason, classificationReason).** DEVONthink stores these as styled text, not
   plain strings. On read, do you want them flattened to plain text, returned as RTF source, or both? My recommendation:
   plain text in v1, with a note in the spec that a future change can add a `format: "rich"` option. Confirm before I
   lock it in.
3. **Set/enum fields with values not in the allowed list.** What should happen if a write specifies a value that isn't
   in the field's `allowedValues`? Reject at the MCP boundary (requires loading the schema first), or pass through and
   let DEVONthink reject it? I'd default to pass-through for simplicity; the schema-discovery tool gives skills what
   they need to validate client-side if they want to.
4. **Multi-database stories.** All four changes default to "current database" when none is specified. For schema
   discovery especially, is there a case where you'd want the union schema across all open databases? If yes, that's a
   v2 feature, not v1.

---

## Quick reference: files touched

| Change | Files |
|---|---|
| 1. Read | `src/tools/getRecordProperties.ts`, `tests/tools/getRecordProperties.test.ts` (new), `tests/integration/identification.test.ts` |
| 2. Schema | `src/tools/getCustomMetadataSchema.ts` (new), `src/index.ts` (register tool), `tests/integration/identification.test.ts` |
| 3. Write | `src/tools/setRecordProperties.ts`, `tests/integration/transformation.test.ts` |
| 4. Search | `src/tools/lookupRecord.ts`, `tests/integration/identification.test.ts` |

No changes needed to `src/applescript/execute.ts`, `src/utils/jxaHelpers.ts`, or `src/utils/escapeString.ts` — the
existing helpers are sufficient.
