import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeJxaMock } = vi.hoisted(() => ({
	executeJxaMock: vi.fn(),
}));

vi.mock("../../src/applescript/execute.js", () => ({
	executeJxa: executeJxaMock,
}));

import { setRecordPropertiesTool } from "../../src/tools/setRecordProperties.js";

describe("setRecordProperties — custom metadata", () => {
	beforeEach(() => {
		executeJxaMock.mockReset();
	});

	it("includes addCustomMetaData calls for custom metadata keys", async () => {
		executeJxaMock.mockResolvedValue({
			success: true,
			uuid: "test-uuid",
			name: "Test",
			recordType: "markdown",
			updated: ["customMetadata.citekey", "customMetadata.reviewed"],
			skipped: [],
		});

		await setRecordPropertiesTool.run?.({
			uuid: "test-uuid",
			customMetadata: { citekey: "smith2024", reviewed: true },
		});

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).toContain("addCustomMetaData");
		expect(script).toContain("smith2024");
	});

	it("normalizes keys with md prefix by stripping the prefix", async () => {
		executeJxaMock.mockResolvedValue({
			success: true,
			updated: ["customMetadata.citekey"],
			skipped: [],
		});

		await setRecordPropertiesTool.run?.({
			uuid: "test-uuid",
			customMetadata: { mdcitekey: "jones2023" },
		});

		const [script] = executeJxaMock.mock.calls[0];
		// The script should use the field name without md prefix for the addCustomMetaData call
		expect(script).toContain('"mdcitekey"');
		expect(script).toContain("jones2023");
	});

	it("handles null values to clear custom metadata fields", async () => {
		executeJxaMock.mockResolvedValue({
			success: true,
			updated: ["customMetadata.citekey"],
			skipped: [],
		});

		await setRecordPropertiesTool.run?.({
			uuid: "test-uuid",
			customMetadata: { citekey: null },
		});

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).toContain("addCustomMetaData");
		expect(script).toContain("value === null");
	});

	it("does not include custom metadata block when customMetadata is not provided", async () => {
		executeJxaMock.mockResolvedValue({
			success: true,
			updated: ["comment"],
			skipped: [],
		});

		await setRecordPropertiesTool.run?.({
			uuid: "test-uuid",
			comment: "hello",
		});

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).not.toContain("addCustomMetaData");
	});
});
