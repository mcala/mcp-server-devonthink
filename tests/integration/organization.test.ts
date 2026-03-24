import { describe, it, expect } from "vitest";
import { jxa, getTestContext, createTestRecord, createTestGroup, deleteRecord } from "./helpers.js";

describe("organization", () => {
	it("list_group_content — lists children of a group", async () => {
		const ctx = getTestContext();
		const group = await createTestGroup(ctx, "Org-ListGroup");
		const rec = await createTestRecord(ctx, "Org-ListChild", "markdown", "# Child", group.uuid);
		try {
			const result = await jxa<{
				success: boolean;
				count?: number;
				childNames?: string[];
				error?: string;
			}>(`
        const grp = theApp.getRecordWithUuid("${group.uuid}");
        if (!grp) throw new Error("Group not found");
        const children = grp.children();
        const names = [];
        for (let i = 0; i < children.length; i++) {
          names.push(children[i].name());
        }
        const r = {};
        r["success"] = true;
        r["count"] = children.length;
        r["childNames"] = names;
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.count).toBeGreaterThanOrEqual(1);
			expect(result.childNames).toContain("Org-ListChild");
		} finally {
			await deleteRecord(rec.uuid);
			await deleteRecord(group.uuid);
		}
	});

	it("add_tags — adds tags to a record", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "Org-AddTags", "markdown", "# Tags");
		try {
			const result = await jxa<{
				success: boolean;
				tags?: string[];
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record) throw new Error("Record not found");
        record.tags = ["org-tag-a", "org-tag-b"];
        const r = {};
        r["success"] = true;
        r["tags"] = record.tags();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.tags).toContain("org-tag-a");
			expect(result.tags).toContain("org-tag-b");
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("remove_tags — removes tags from a record", async () => {
		const ctx = getTestContext();
		const rec = await createTestRecord(ctx, "Org-RemoveTags", "markdown", "# Tags");
		try {
			// Set tags first
			await jxa(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        record.tags = ["keep-tag", "remove-tag"];
        return JSON.stringify({ success: true });
      `);

			// Remove one tag
			const result = await jxa<{
				success: boolean;
				tags?: string[];
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        const currentTags = record.tags();
        const newTags = [];
        for (let i = 0; i < currentTags.length; i++) {
          if (currentTags[i] !== "remove-tag") newTags.push(currentTags[i]);
        }
        record.tags = newTags;
        const r = {};
        r["success"] = true;
        r["tags"] = record.tags();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.tags).toContain("keep-tag");
			expect(result.tags).not.toContain("remove-tag");
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("move_record — moves record to another group", async () => {
		const ctx = getTestContext();
		const srcGroup = await createTestGroup(ctx, "Org-MoveSrc");
		const destGroup = await createTestGroup(ctx, "Org-MoveDest");
		const rec = await createTestRecord(
			ctx,
			"Org-MoveRec",
			"markdown",
			"# Move Me",
			srcGroup.uuid,
		);
		try {
			const result = await jxa<{
				success: boolean;
				newLocation?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        const dest = theApp.getRecordWithUuid("${destGroup.uuid}");
        if (!record || !dest) throw new Error("Record or destination not found");
        theApp.move({ record: record, to: dest });
        const r = {};
        r["success"] = true;
        r["newLocation"] = record.location();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.newLocation).toContain("Org-MoveDest");
		} finally {
			await deleteRecord(rec.uuid);
			await deleteRecord(srcGroup.uuid);
			await deleteRecord(destGroup.uuid);
		}
	});

	it("replicate_record — creates linked reference (same UUID)", async () => {
		const ctx = getTestContext();
		const group = await createTestGroup(ctx, "Org-ReplicateDest");
		const rec = await createTestRecord(ctx, "Org-ReplicateRec", "markdown", "# Replicate Me");
		try {
			const result = await jxa<{
				success: boolean;
				originalUuid?: string;
				replicantUuid?: string;
				sameUuid?: boolean;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        const dest = theApp.getRecordWithUuid("${group.uuid}");
        if (!record || !dest) throw new Error("Record or destination not found");
        const replicant = theApp.replicate({ record: record, to: dest });
        const r = {};
        r["success"] = true;
        r["originalUuid"] = record.uuid();
        r["replicantUuid"] = replicant.uuid();
        r["sameUuid"] = record.uuid() === replicant.uuid();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.sameUuid).toBe(true);
		} finally {
			await deleteRecord(rec.uuid);
			await deleteRecord(group.uuid);
		}
	});

	it("duplicate_record — creates independent copy (different UUID)", async () => {
		const ctx = getTestContext();
		const group = await createTestGroup(ctx, "Org-DuplicateDest");
		const rec = await createTestRecord(ctx, "Org-DuplicateRec", "markdown", "# Duplicate Me");
		let duplicateUuid: string | undefined;
		try {
			const result = await jxa<{
				success: boolean;
				originalUuid?: string;
				duplicateUuid?: string;
				differentUuid?: boolean;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        const dest = theApp.getRecordWithUuid("${group.uuid}");
        if (!record || !dest) throw new Error("Record or destination not found");
        const dup = theApp.duplicate({ record: record, to: dest });
        const r = {};
        r["success"] = true;
        r["originalUuid"] = record.uuid();
        r["duplicateUuid"] = dup.uuid();
        r["differentUuid"] = record.uuid() !== dup.uuid();
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.differentUuid).toBe(true);
			duplicateUuid = result.duplicateUuid;
		} finally {
			await deleteRecord(rec.uuid);
			if (duplicateUuid) await deleteRecord(duplicateUuid);
			await deleteRecord(group.uuid);
		}
	});
});
