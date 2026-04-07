import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeJxaMock } = vi.hoisted(() => ({
	executeJxaMock: vi.fn(),
}));

vi.mock("../../src/applescript/execute.js", () => ({
	executeJxa: executeJxaMock,
}));

import { lookupRecordTool } from "../../src/tools/lookupRecord.js";

describe("lookupRecord — customMetadata", () => {
	beforeEach(() => {
		executeJxaMock.mockReset();
	});

	it("builds a search query with mdkeyword prefix for custom metadata lookup", async () => {
		executeJxaMock.mockResolvedValue({
			success: true,
			results: [],
			totalCount: 0,
		});

		await lookupRecordTool.run?.({
			lookupType: "customMetadata",
			value: "",
			customMetadataField: "citekey",
			customMetadataValue: "smith2024",
		});

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).toContain("mdkeyword:");
		expect(script).toContain('"citekey"');
		expect(script).toContain('"md" + fieldKey.toLowerCase()');
		expect(script).toContain("smith2024");
	});

	it("handles field names that already have md prefix", async () => {
		executeJxaMock.mockResolvedValue({
			success: true,
			results: [],
			totalCount: 0,
		});

		await lookupRecordTool.run?.({
			lookupType: "customMetadata",
			value: "",
			customMetadataField: "mdcitekey",
			customMetadataValue: "jones2023",
		});

		const [script] = executeJxaMock.mock.calls[0];
		// Should not double-prefix
		expect(script).toContain("mdcitekey");
		expect(script).not.toContain("mdmdcitekey");
	});

	it("rejects invalid custom metadata field names", async () => {
		const result = await lookupRecordTool.run?.({
			lookupType: "customMetadata",
			value: "",
			customMetadataField: "bad\u0000field",
			customMetadataValue: "test",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("invalid characters");
		expect(executeJxaMock).not.toHaveBeenCalled();
	});
});
