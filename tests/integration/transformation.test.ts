import { describe, it, expect } from "vitest";
import { jxa, getTestContext, createTestRecord, deleteRecord } from "./helpers.js";

describe("transformation", () => {
	it("convert_record — converts markdown to another format", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(
			ctx,
			"Transform-Convert",
			"markdown",
			"# Convert Test\nSome content to convert.",
		);
		let convertedUuid: string | undefined;
		try {
			const result = await jxa<{
				success: boolean;
				convertedUuid?: string;
				convertedName?: string;
				format?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        const db = theApp.getDatabaseWithUuid("${ctx.dbUuid}");
        if (!record || !db) throw new Error("Record or database not found");

        const formats = ["rich", "HTML", "simple"];
        let converted = null;
        let usedFormat = "";
        for (let i = 0; i < formats.length; i++) {
          try {
            converted = theApp.convert({ record: record, to: formats[i], in: db.root() });
            if (converted) {
              usedFormat = formats[i];
              break;
            }
          } catch (e) {
            // Try next format
          }
        }

        if (!converted) throw new Error("All conversion formats failed");
        const r = {};
        r["success"] = true;
        r["convertedUuid"] = converted.uuid();
        r["convertedName"] = converted.name();
        r["format"] = usedFormat;
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.convertedUuid).toBeTruthy();
			convertedUuid = result.convertedUuid;
		} finally {
			await deleteRecord(rec.uuid);
			if (convertedUuid) await deleteRecord(convertedUuid);
		}
	});

	it("classify — gets classification suggestions (0 results OK)", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(
			ctx,
			"Transform-Classify",
			"markdown",
			"# Classify Test\nThis is a document about testing.",
		);
		try {
			const result = await jxa<{
				success: boolean;
				count?: number;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record) throw new Error("Record not found");
        const suggestions = theApp.classify({ record: record });
        const r = {};
        r["success"] = true;
        r["count"] = suggestions ? suggestions.length : 0;
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.count).toBeGreaterThanOrEqual(0);
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("compare — finds similar records (no crash)", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(
			ctx,
			"Transform-Compare",
			"markdown",
			"# Compare Test\nThis is a document for comparison testing.",
		);
		try {
			const result = await jxa<{
				success: boolean;
				count?: number;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record) throw new Error("Record not found");
        const similar = theApp.compare({ record: record });
        const r = {};
        r["success"] = true;
        r["count"] = similar ? similar.length : 0;
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.count).toBeGreaterThanOrEqual(0);
		} finally {
			await deleteRecord(rec.uuid);
		}
	});
});
