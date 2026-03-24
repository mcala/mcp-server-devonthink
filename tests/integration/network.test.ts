import { describe, it, expect, afterAll } from "vitest";
import { jxa, getTestContext, deleteRecord, sleep } from "./helpers.js";
import * as http from "node:http";

describe("network", () => {
	let server: http.Server | null = null;
	let serverPort = 0;

	afterAll(() => {
		if (server) {
			server.close();
			server = null;
		}
	});

	it("create_from_url — creates record from local HTTP server", async () => {
		const ctx = getTestContext();

		// Start local HTTP server
		const html = `<!DOCTYPE html><html><head><title>MCP Test Page</title></head><body><h1>Test</h1><p>Integration test page.</p></body></html>`;
		server = http.createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(html);
		});

		await new Promise<void>((resolve) => {
			server!.listen(0, "127.0.0.1", () => {
				const addr = server!.address();
				if (addr && typeof addr === "object") {
					serverPort = addr.port;
				}
				resolve();
			});
		});

		expect(serverPort).toBeGreaterThan(0);

		let recordUuid: string | undefined;
		try {
			const result = await jxa<{
				success: boolean;
				uuid?: string;
				name?: string;
				error?: string;
			}>(`
        const db = theApp.getDatabaseWithUuid("${ctx.dbUuid}");
        if (!db) throw new Error("Temp database not found");
        const opts = {};
        opts["in"] = db.root();
        const record = theApp.createFormattedNoteFrom("http://127.0.0.1:${serverPort}/test.html", opts);
        if (!record || !record.exists()) throw new Error("Failed to create record from URL");
        const r = {};
        r["success"] = true;
        r["uuid"] = record.uuid();
        r["name"] = record.name();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.uuid).toBeTruthy();
			recordUuid = result.uuid;
		} finally {
			if (recordUuid) await deleteRecord(recordUuid);
			if (server) {
				server.close();
				server = null;
			}
		}
	});
});
