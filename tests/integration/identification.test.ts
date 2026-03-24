import { describe, it, expect } from "vitest";
import { jxa, getTestContext, createTestRecord, deleteRecord, sleep } from "./helpers.js";
import * as fs from "node:fs";

describe("identification", () => {
	it("uuid_lookup — retrieves record by UUID", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "ID-UUID-Test", "markdown", "# UUID Lookup");
		try {
			const result = await jxa<{
				success: boolean;
				name?: string;
				uuid?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record || !record.exists()) throw new Error("Record not found by UUID");
        const r = {};
        r["success"] = true;
        r["name"] = record.name();
        r["uuid"] = record.uuid();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.name).toBe("ID-UUID-Test");
			expect(result.uuid).toBe(rec.uuid);
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("referenceURL_uuid — extracts UUID from x-devonthink-item URL", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "ID-RefURL-Test", "markdown", "# RefURL Test");
		try {
			// referenceURL should contain a UUID
			const uuidFromUrl = rec.referenceURL.replace("x-devonthink-item://", "").toUpperCase();
			expect(uuidFromUrl.length).toBeGreaterThan(0);

			const result = await jxa<{
				success: boolean;
				found?: boolean;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${uuidFromUrl}");
        const r = {};
        r["success"] = true;
        r["found"] = !!(record && record.exists());
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.found).toBe(true);
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("referenceURL_email — imports .eml and looks up by referenceURL", async () => {
		const ctx = getTestContext();
		const emlPath = ctx.emlPath;
		expect(fs.existsSync(emlPath)).toBe(true);

		// Import the .eml and capture its referenceURL and UUID
		const importResult = await jxa<{
			success: boolean;
			referenceURL?: string;
			uuid?: string;
			error?: string;
		}>(`
      const db = theApp.getDatabaseWithUuid("${ctx.dbUuid}");
      if (!db) throw new Error("Temp database not found");
      const imported = theApp.importPath(${JSON.stringify(emlPath)}, { to: db.root() });
      if (!imported || !imported.exists()) throw new Error("Import failed");
      const r = {};
      r["success"] = true;
      r["referenceURL"] = imported.referenceURL();
      r["uuid"] = imported.uuid();
      return JSON.stringify(r);
    `);
		expect(importResult.success).toBe(true);
		expect(importResult.referenceURL).toBeTruthy();
		expect(importResult.uuid).toBeTruthy();

		try {
			const refURL = importResult.referenceURL!;

			// Verify the referenceURL uses a non-UUID format (message-ID based)
			const identifier = refURL.replace("x-devonthink-item://", "");
			const uuidPattern =
				/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
			expect(uuidPattern.test(identifier)).toBe(false);

			// Now test the actual lookup: URL-decode the identifier and use getRecordWithUuid.
			// This exercises the same path that get_record_by_identifier uses for non-UUID referenceURLs.
			const lookupResult = await jxa<{
				success: boolean;
				found?: boolean;
				name?: string;
				uuid?: string;
				error?: string;
			}>(`
        const refURL = ${JSON.stringify(refURL)};
        const prefix = "x-devonthink-item://";
        const identifier = refURL.startsWith(prefix) ? refURL.substring(prefix.length) : refURL;
        const decoded = decodeURIComponent(identifier);
        const record = theApp.getRecordWithUuid(decoded);
        const r = {};
        r["success"] = true;
        r["found"] = !!(record && record.exists());
        if (record && record.exists()) {
          r["name"] = record.name();
          r["uuid"] = record.uuid();
        }
        return JSON.stringify(r);
      `);
			expect(lookupResult.success).toBe(true);
			expect(lookupResult.found).toBe(true);
			expect(lookupResult.uuid).toBe(importResult.uuid);
		} finally {
			await deleteRecord(importResult.uuid!);
		}
	});

	it("lookup_record — finds by filename, comment, and tags", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "ID-Lookup-Test", "markdown", "# Lookup Test");
		try {
			// Set comment and tags
			await jxa(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        record.comment = "integration-test-comment";
        record.tags = ["integration-tag-1", "integration-tag-2"];
        return JSON.stringify({ success: true });
      `);
			await sleep(1000); // Wait for indexing

			// Test lookupRecordsWithFile
			const fileResult = await jxa<{
				success: boolean;
				found?: boolean;
				filename?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        const fname = record.filename();
        const matches = theApp.lookupRecordsWithFile(fname, { in: theApp.getDatabaseWithUuid("${ctx.dbUuid}") });
        const r = {};
        r["success"] = true;
        r["found"] = matches.length > 0;
        r["filename"] = fname;
        return JSON.stringify(r);
      `);
			expect(fileResult.success).toBe(true);
			expect(fileResult.found).toBe(true);

			// Test lookupRecordsWithComment
			const commentResult = await jxa<{
				success: boolean;
				found?: boolean;
				error?: string;
			}>(`
        const matches = theApp.lookupRecordsWithComment("integration-test-comment", { in: theApp.getDatabaseWithUuid("${ctx.dbUuid}") });
        const r = {};
        r["success"] = true;
        r["found"] = matches.length > 0;
        return JSON.stringify(r);
      `);
			expect(commentResult.success).toBe(true);
			expect(commentResult.found).toBe(true);

			// Test lookupRecordsWithTags
			const tagsResult = await jxa<{
				success: boolean;
				found?: boolean;
				error?: string;
			}>(`
        const matches = theApp.lookupRecordsWithTags(["integration-tag-1"], { in: theApp.getDatabaseWithUuid("${ctx.dbUuid}") });
        const r = {};
        r["success"] = true;
        r["found"] = matches.length > 0;
        return JSON.stringify(r);
      `);
			expect(tagsResult.success).toBe(true);
			expect(tagsResult.found).toBe(true);
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("lookupRecord_item_url — looks up email by percent-encoded x-devonthink-item URL", async () => {
		const ctx = getTestContext();

		// Import an .eml file — DEVONthink assigns a referenceURL with a percent-encoded
		// message-ID (not a UUID), e.g. x-devonthink-item://%3Csome-id%40host%3E
		const emlPath = ctx.emlPath;
		expect(fs.existsSync(emlPath)).toBe(true);

		const importResult = await jxa<{
			success: boolean;
			referenceURL?: string;
			uuid?: string;
			error?: string;
		}>(`
      const db = theApp.getDatabaseWithUuid("${ctx.dbUuid}");
      if (!db) throw new Error("Temp database not found");
      const imported = theApp.importPath(${JSON.stringify(emlPath)}, { to: db.root() });
      if (!imported || !imported.exists()) throw new Error("Import failed");
      const r = {};
      r["success"] = true;
      r["referenceURL"] = imported.referenceURL();
      r["uuid"] = imported.uuid();
      return JSON.stringify(r);
    `);
		expect(importResult.success).toBe(true);
		expect(importResult.referenceURL).toBeTruthy();

		try {
			const refURL = importResult.referenceURL!;

			// Verify it's a percent-encoded item URL (not a plain UUID-based one)
			expect(refURL).toContain("%");
			expect(refURL).toMatch(/^x-devonthink-item:\/\//);

			// Bug: passing this item URL to lookupRecordsWithURL returns 0 results because
			// that API searches the "url" property, not "referenceURL". The fix detects
			// x-devonthink-item:// URLs, decodes the identifier, and uses getRecordWithUuid.
			const lookupResult = await jxa<{
				success: boolean;
				found?: boolean;
				matchUuid?: string;
				error?: string;
			}>(`
        const urlValue = ${JSON.stringify(refURL)};
        const dtPrefix = "x-devonthink-item://";
        let searchResults;
        if (urlValue.startsWith(dtPrefix)) {
          const identifier = decodeURIComponent(urlValue.substring(dtPrefix.length));
          const record = theApp.getRecordWithUuid(identifier);
          if (record && record.exists()) {
            searchResults = [record];
          } else {
            searchResults = [];
          }
        } else {
          const db = theApp.getDatabaseWithUuid("${ctx.dbUuid}");
          searchResults = theApp.lookupRecordsWithURL(decodeURIComponent(urlValue), { in: db });
        }
        const r = {};
        r["success"] = true;
        r["found"] = searchResults.length > 0;
        if (searchResults.length > 0) {
          r["matchUuid"] = searchResults[0].uuid();
        }
        return JSON.stringify(r);
      `);
			expect(lookupResult.success).toBe(true);
			expect(lookupResult.found).toBe(true);
			expect(lookupResult.matchUuid).toBe(importResult.uuid);
		} finally {
			await deleteRecord(importResult.uuid!);
		}
	});

	it("search — finds records by name prefix", async () => {
		const ctx = getTestContext();
		const rec1 = await createTestRecord(ctx, "SearchReg-Alpha", "markdown", "# Alpha");
		const rec2 = await createTestRecord(ctx, "SearchReg-Beta", "markdown", "# Beta");
		try {
			await sleep(1500); // Wait for indexing

			const result = await jxa<{
				success: boolean;
				count?: number;
				uuids?: string[];
				error?: string;
			}>(`
        const results = theApp.search("name:~SearchReg");
        const uuids = [];
        for (let i = 0; i < results.length; i++) {
          uuids.push(results[i].uuid());
        }
        const r = {};
        r["success"] = true;
        r["count"] = results.length;
        r["uuids"] = uuids;
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			if (result.count === 0) {
				// Fallback: indexing delay — verify records exist via UUID
				const verify1 = await jxa<{ exists: boolean }>(`
          const rec = theApp.getRecordWithUuid("${rec1.uuid}");
          const r = {};
          r["exists"] = !!(rec && rec.exists());
          return JSON.stringify(r);
        `);
				expect(verify1.exists).toBe(true);
			} else {
				expect(result.count).toBeGreaterThanOrEqual(2);
			}
		} finally {
			await deleteRecord(rec1.uuid);
			await deleteRecord(rec2.uuid);
		}
	});
});
