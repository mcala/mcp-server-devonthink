import { describe, it, expect } from "vitest";
import { jxa, getTestContext, createTestRecord, deleteRecord } from "./helpers.js";

describe("crud", () => {
	it("create_record — creates a markdown record", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(
			ctx,
			"CRUD-Create-Test",
			"markdown",
			"# Test\nCreated by CRUD test.",
		);
		try {
			expect(rec.uuid).toBeTruthy();
			expect(rec.id).toBeGreaterThan(0);
			expect(rec.referenceURL).toContain("x-devonthink-item://");
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("get_record_properties — retrieves record metadata", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "CRUD-Props-Test", "markdown", "# Props Test");
		try {
			const result = await jxa<{
				success: boolean;
				name?: string;
				uuid?: string;
				type?: string;
				referenceURL?: string;
				creationDate?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record || !record.exists()) throw new Error("Record not found");
        const r = {};
        r["success"] = true;
        r["name"] = record.name();
        r["uuid"] = record.uuid();
        r["type"] = record.type();
        r["referenceURL"] = record.referenceURL();
        r["creationDate"] = record.creationDate().toString();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.name).toBe("CRUD-Props-Test");
			expect(result.uuid).toBe(rec.uuid);
			expect(result.referenceURL).toContain("x-devonthink-item://");
			expect(result.creationDate).toBeTruthy();
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("get_record_content — retrieves record content", async () => {
		const ctx = getTestContext();
		const content = "# Content Test\nThis is the body.";
		const rec = await createTestRecord(ctx, "CRUD-Content-Test", "markdown", content);
		try {
			const result = await jxa<{
				success: boolean;
				content?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record || !record.exists()) throw new Error("Record not found");
        const r = {};
        r["success"] = true;
        r["content"] = record.plainText();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.content).toContain("Content Test");
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("update_record_content — updates record content preserving UUID", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "CRUD-Update-Test", "markdown", "# Original");
		try {
			const result = await jxa<{
				success: boolean;
				content?: string;
				sameUuid?: boolean;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record || !record.exists()) throw new Error("Record not found");
        record.plainText = "# Updated\\nNew content here.";
        const r = {};
        r["success"] = true;
        r["content"] = record.plainText();
        r["sameUuid"] = record.uuid() === "${rec.uuid}";
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.content).toContain("Updated");
			expect(result.sameUuid).toBe(true);
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("rename_record — renames a record", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "CRUD-Rename-Before", "markdown", "# Rename Test");
		try {
			const result = await jxa<{
				success: boolean;
				newName?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record || !record.exists()) throw new Error("Record not found");
        record.name = "CRUD-Rename-After";
        const r = {};
        r["success"] = true;
        r["newName"] = record.name();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.newName).toBe("CRUD-Rename-After");
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("set_record_properties — sets comment and flag", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "CRUD-SetProps-Test", "markdown", "# Set Props");
		try {
			const result = await jxa<{
				success: boolean;
				comment?: string;
				flagged?: boolean;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record || !record.exists()) throw new Error("Record not found");
        record.comment = "Test comment from integration test";
        record.flag = 1;
        const r = {};
        r["success"] = true;
        r["comment"] = record.comment();
        r["flagged"] = !!record.flag();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.comment).toBe("Test comment from integration test");
			expect(result.flagged).toBe(true);
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("delete_record — deletes and verifies removal", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "CRUD-Delete-Test", "markdown", "# Delete Me");
		await deleteRecord(rec.uuid);

		const result = await jxa<{
			success: boolean;
			found: boolean;
		}>(`
      const record = theApp.getRecordWithUuid("${rec.uuid}");
      const r = {};
      r["success"] = true;
      r["found"] = !!(record && record.exists());
      return JSON.stringify(r);
    `);
		expect(result.success).toBe(true);
		expect(result.found).toBe(false);
	});
});
