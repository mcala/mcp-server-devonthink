import { executeJxa } from "../../src/applescript/execute.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeTestContext, cleanupContextFile, type TestContext } from "./helpers.js";

let ctx: TestContext;

export async function setup() {
	const timestamp = Date.now().toString();
	const dbName = `MCP-Test-${timestamp}`;
	const dbPath = path.join(os.tmpdir(), `${dbName}.dtBase2`);
	const emlPath = path.join(os.tmpdir(), `mcp-test-email-${timestamp}.eml`);

	// Create .eml file
	const messageId = `mcp-test-${timestamp}@regression.test`;
	fs.writeFileSync(
		emlPath,
		[
			"From: sender@example.com",
			"To: recipient@example.com",
			"Subject: MCP Regression Test Email",
			"Date: Mon, 1 Jan 2024 12:00:00 +0000",
			`Message-ID: <${messageId}>`,
			"MIME-Version: 1.0",
			'Content-Type: text/plain; charset="UTF-8"',
			"",
			"This is a test email for MCP regression testing.",
		].join("\n"),
	);

	// Create temp database
	const result = await executeJxa<{
		success: boolean;
		uuid?: string;
		error?: string;
	}>(
		`(() => {
      const theApp = Application("DEVONthink");
      theApp.includeStandardAdditions = true;
      try {
        const db = theApp.createDatabase("${dbPath}");
        if (!db) throw new Error("Failed to create temp database");
        const r = {};
        r["success"] = true;
        r["uuid"] = db.uuid();
        return JSON.stringify(r);
      } catch (error) {
        const r = {};
        r["success"] = false;
        r["error"] = error.toString();
        return JSON.stringify(r);
      }
    })()`,
	);

	if (!result.success || !result.uuid) {
		throw new Error(`Setup failed: ${result.error || "Could not create temp database"}`);
	}

	ctx = { dbPath, dbUuid: result.uuid, dbName, emlPath, timestamp };
	writeTestContext(ctx);
	console.log(`[integration] Created temp database: ${dbName}`);
}

export async function teardown() {
	if (!ctx) return;

	// Close the database in DEVONthink
	try {
		await executeJxa(
			`(() => {
        const theApp = Application("DEVONthink");
        theApp.includeStandardAdditions = true;
        const databases = theApp.databases();
        for (let i = 0; i < databases.length; i++) {
          if (databases[i].uuid() === "${ctx.dbUuid}") {
            theApp.close(databases[i]);
            break;
          }
        }
        return JSON.stringify({ success: true });
      })()`,
		);
	} catch (_) {}

	// Remove temp files
	try {
		fs.rmSync(ctx.dbPath, { recursive: true, force: true });
	} catch (_) {}
	try {
		fs.unlinkSync(ctx.emlPath);
	} catch (_) {}

	cleanupContextFile();
	console.log(`[integration] Cleaned up temp database`);
}
