import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Tool, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { executeJxa } from "../applescript/execute.js";
import { escapeStringForJXA, isJXASafeString } from "../utils/escapeString.js";

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

const GetCustomMetadataSchemaSchema = z
	.object({
		databaseName: z
			.string()
			.optional()
			.describe("Database to get schema from (defaults to current database)"),
	})
	.strict();

type GetCustomMetadataSchemaInput = z.infer<typeof GetCustomMetadataSchemaSchema>;

interface CustomMetadataField {
	key: string;
	internalKey: string;
	displayName: string;
	type:
		| "text"
		| "richtext"
		| "date"
		| "integer"
		| "decimal"
		| "boolean"
		| "url"
		| "set"
		| "unknown";
	allowedValues?: string[];
}

interface GetCustomMetadataSchemaResult {
	success: boolean;
	error?: string;
	databaseName?: string;
	fields?: CustomMetadataField[];
}

const getCustomMetadataSchema = async (
	input: GetCustomMetadataSchemaInput,
): Promise<GetCustomMetadataSchemaResult> => {
	const { databaseName } = input;

	if (databaseName && !isJXASafeString(databaseName)) {
		return { success: false, error: "Database name contains invalid characters" };
	}

	const script = `
    (() => {
      const theApp = Application("DEVONthink");
      theApp.includeStandardAdditions = true;

      try {
        // Get target database
        let targetDatabase;
        if (${databaseName ? `"${escapeStringForJXA(databaseName)}"` : "null"}) {
          const databases = theApp.databases();
          const dbName = ${databaseName ? `"${escapeStringForJXA(databaseName)}"` : "null"};
          for (let i = 0; i < databases.length; i++) {
            if (databases[i].name() === dbName) {
              targetDatabase = databases[i];
              break;
            }
          }
          if (!targetDatabase) {
            const err = {};
            err["success"] = false;
            err["error"] = "Database not found: " + dbName;
            return JSON.stringify(err);
          }
        } else {
          targetDatabase = theApp.currentDatabase();
        }

        const dbDisplayName = targetDatabase.name();

        // Get custom metadata definitions from DEVONthink
        const customMetaDefs = theApp.customMetaData();
        const fields = [];

        if (customMetaDefs && typeof customMetaDefs === "object") {
          const keys = Object.keys(customMetaDefs);
          for (let i = 0; i < keys.length; i++) {
            const internalKey = keys[i];
            const def = customMetaDefs[internalKey];

            const publicKey = internalKey.startsWith("md") ? internalKey.slice(2) : internalKey;

            const field = {};
            field["key"] = publicKey;
            field["internalKey"] = internalKey;

            // Extract display name — may be a property or the key itself
            if (def && typeof def === "object") {
              field["displayName"] = def.name ? def.name : publicKey;

              // Map type strings to our union
              const rawType = def.type ? String(def.type).toLowerCase() : "unknown";
              if (rawType === "string" || rawType === "text") {
                field["type"] = "text";
              } else if (rawType === "richtext" || rawType === "rich text" || rawType === "rtf") {
                field["type"] = "richtext";
              } else if (rawType === "date" || rawType === "datetime") {
                field["type"] = "date";
              } else if (rawType === "integer" || rawType === "int" || rawType === "long") {
                field["type"] = "integer";
              } else if (rawType === "real" || rawType === "decimal" || rawType === "float" || rawType === "double" || rawType === "number") {
                field["type"] = "decimal";
              } else if (rawType === "boolean" || rawType === "bool") {
                field["type"] = "boolean";
              } else if (rawType === "url") {
                field["type"] = "url";
              } else if (rawType === "set" || rawType === "enum") {
                field["type"] = "set";
                if (def.allowedValues && Array.isArray(def.allowedValues)) {
                  field["allowedValues"] = def.allowedValues;
                } else if (def.values && Array.isArray(def.values)) {
                  field["allowedValues"] = def.values;
                }
              } else {
                field["type"] = "unknown";
              }
            } else {
              // Simple value — the def might just be a string describing the type
              field["displayName"] = publicKey;
              field["type"] = "unknown";
            }

            fields.push(field);
          }
        }

        const result = {};
        result["success"] = true;
        result["databaseName"] = dbDisplayName;
        result["fields"] = fields;
        return JSON.stringify(result);
      } catch (error) {
        const err = {};
        err["success"] = false;
        err["error"] = error.toString();
        return JSON.stringify(err);
      }
    })();
  `;

	return await executeJxa<GetCustomMetadataSchemaResult>(script);
};

export const getCustomMetadataSchemaTool: Tool = {
	name: "get_custom_metadata_schema",
	description:
		"Discover the custom metadata schema for a DEVONthink database. Returns all user-defined custom metadata field definitions including keys, display names, types, and allowed values (for set/enum fields). Schema lookups are cheap but not cached — the caller should cache if needed.\n\nExample:\n" +
		'{\n  "databaseName": "My Database"\n}',
	inputSchema: zodToJsonSchema(GetCustomMetadataSchemaSchema) as ToolInput,
	run: getCustomMetadataSchema,
};
