import { describe, it, expect } from "vitest";
import { jxa, getTestContext } from "./helpers.js";

describe("connectivity", () => {
	it("is_running — DEVONthink is running", async () => {
		const result = await jxa<{ success: boolean; running: boolean }>(`
      const r = {};
      r["success"] = true;
      r["running"] = theApp.running();
      return JSON.stringify(r);
    `);
		expect(result.success).toBe(true);
		expect(result.running).toBe(true);
	});

	it("get_open_databases — temp DB appears in list", async () => {
		const ctx = getTestContext();
		const result = await jxa<{
			success: boolean;
			found: boolean;
			count: number;
		}>(`
      const databases = theApp.databases();
      let found = false;
      for (let i = 0; i < databases.length; i++) {
        if (databases[i].uuid() === "${ctx.dbUuid}") found = true;
      }
      const r = {};
      r["success"] = true;
      r["found"] = found;
      r["count"] = databases.length;
      return JSON.stringify(r);
    `);
		expect(result.success).toBe(true);
		expect(result.found).toBe(true);
	});

	it("api_compatibility — required JXA methods exist", async () => {
		const result = await jxa<{ success: boolean; version: string }>(`
      const version = theApp.version();
      const checks = [
        typeof theApp.databases === "function",
        typeof theApp.currentDatabase === "function",
        typeof theApp.search === "function",
        typeof theApp.createRecordWith === "function",
        typeof theApp.getRecordWithUuid === "function",
        typeof theApp.getRecordWithId === "function",
        typeof theApp.importPath === "function",
        typeof theApp.lookupRecordsWithFile === "function",
        typeof theApp.lookupRecordsWithURL === "function",
      ];
      if (checks.some(c => !c)) throw new Error("Missing API methods");
      const r = {};
      r["success"] = true;
      r["version"] = version;
      return JSON.stringify(r);
    `);
		expect(result.success).toBe(true);
		expect(result.version).toBeTruthy();
	});
});
