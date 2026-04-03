import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Tool, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { executeJxa } from "../applescript/execute.js";
import { escapeStringForJXA, isJXASafeString } from "../utils/escapeString.js";
import { getDatabaseHelper } from "../utils/jxaHelpers.js";

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

const ImportFileSchema = z
	.object({
		filePath: z
			.string()
			.describe("POSIX file path or file URL of the file or folder to import"),
		name: z.string().optional().describe("Custom name for the imported record (optional)"),
		parentGroupUuid: z
			.string()
			.optional()
			.describe(
				"UUID of the destination group (optional, overrides the default Inbox destination)",
			),
		databaseName: z
			.string()
			.optional()
			.describe(
				"Database to import into when parentGroupUuid is not provided (optional, defaults to global Inbox when omitted)",
			),
	})
	.strict();

type ImportFileInput = z.infer<typeof ImportFileSchema>;

interface ImportFileResult {
	success: boolean;
	error?: string;
	recordId?: number;
	name?: string;
	path?: string;
	location?: string;
	uuid?: string;
	referenceURL?: string;
	indexed?: boolean;
}

const importFile = async (input: ImportFileInput): Promise<ImportFileResult> => {
	const { filePath, name, parentGroupUuid, databaseName } = input;

	if (!isJXASafeString(filePath)) {
		return { success: false, error: "File path contains invalid characters" };
	}
	if (name && !isJXASafeString(name)) {
		return { success: false, error: "Name contains invalid characters" };
	}
	if (parentGroupUuid && !isJXASafeString(parentGroupUuid)) {
		return { success: false, error: "Parent group UUID contains invalid characters" };
	}
	if (databaseName && !isJXASafeString(databaseName)) {
		return { success: false, error: "Database name contains invalid characters" };
	}

	const script = `
    (() => {
      const theApp = Application("DEVONthink");
      theApp.includeStandardAdditions = true;

      ${getDatabaseHelper}

      try {
        const pFilePath = "${escapeStringForJXA(filePath)}";
        const pName = ${name ? `"${escapeStringForJXA(name)}"` : "null"};
        const pParentGroupUuid = ${parentGroupUuid ? `"${escapeStringForJXA(parentGroupUuid)}"` : "null"};
        const pDatabaseName = ${databaseName ? `"${escapeStringForJXA(databaseName)}"` : "null"};

        let destinationGroup = null;

        if (pParentGroupUuid) {
          destinationGroup = theApp.getRecordWithUuid(pParentGroupUuid);
          if (!destinationGroup) {
            throw new Error("Parent group with UUID not found: " + pParentGroupUuid);
          }

          const destinationType = destinationGroup.recordType();
          if (destinationType !== "group" && destinationType !== "smart group") {
            throw new Error("Destination is not a group. Record type: " + destinationType);
          }
        } else if (pDatabaseName) {
          const targetDatabase = getDatabase(theApp, pDatabaseName);
          destinationGroup = targetDatabase.incomingGroup();
          if (!destinationGroup) {
            destinationGroup = targetDatabase.root();
          }
          if (!destinationGroup) {
            throw new Error("No destination group available for database: " + targetDatabase.name());
          }
        } else {
          const inboxDatabase = theApp.inbox();
          if (!inboxDatabase) {
            throw new Error("Global inbox database not available");
          }
          destinationGroup = inboxDatabase.root();
          if (!destinationGroup) {
            throw new Error("Global inbox root not available");
          }
        }

        const options = {};
        options["to"] = destinationGroup;
        if (pName) {
          options["name"] = pName;
        }

        const imported = theApp.importPath(pFilePath, options);
        if (!imported || !imported.exists()) {
          throw new Error("Import failed for path: " + pFilePath);
        }

        const response = {};
        response["success"] = true;
        response["recordId"] = imported.id();
        response["name"] = imported.name();
        response["path"] = imported.path();
        response["location"] = imported.location();
        response["uuid"] = imported.uuid();
        response["referenceURL"] = imported.referenceURL();
        response["indexed"] = imported.indexed();
        return JSON.stringify(response);
      } catch (error) {
        const errorResponse = {};
        errorResponse["success"] = false;
        errorResponse["error"] = error.toString();
        return JSON.stringify(errorResponse);
      }
    })();
  `;

	return await executeJxa<ImportFileResult>(script);
};

export const importFileTool: Tool = {
	name: "import_file",
	description:
		'Import an existing file or folder from a POSIX path or file URL into DEVONthink. Defaults to the global Inbox when no destination is provided.\n\nExample:\n{\n  "filePath": "/Users/david/Documents/report.pdf"\n}',
	inputSchema: zodToJsonSchema(ImportFileSchema) as ToolInput,
	run: importFile,
};
