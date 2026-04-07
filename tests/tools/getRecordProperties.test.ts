import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeJxaMock } = vi.hoisted(() => ({
	executeJxaMock: vi.fn(),
}));

vi.mock("../../src/applescript/execute.js", () => ({
	executeJxa: executeJxaMock,
}));

import { getRecordPropertiesTool } from "../../src/tools/getRecordProperties.js";

describe("getRecordProperties — custom metadata", () => {
	beforeEach(() => {
		executeJxaMock.mockReset();
	});

	it("returns customMetadata with md prefix stripped", async () => {
		const mockResult = {
			success: true,
			id: 1,
			uuid: "test-uuid",
			name: "Test",
			path: "/test",
			location: "/",
			recordType: "markdown",
			kind: "Markdown",
			creationDate: "2024-01-01",
			modificationDate: "2024-01-02",
			additionDate: "2024-01-01",
			size: 100,
			tags: [],
			comment: "",
			url: "",
			rating: 0,
			label: 0,
			flag: false,
			unread: false,
			locked: false,
			wordCount: 10,
			characterCount: 50,
			customMetadata: {
				citekey: "smith2024",
				reviewed: true,
				priority: 5,
			},
		};
		executeJxaMock.mockResolvedValue(mockResult);

		const result = await getRecordPropertiesTool.run?.({
			uuid: "test-uuid",
		});

		expect(result).toBeDefined();
		expect(result.success).toBe(true);
		expect(result.customMetadata).toEqual({
			citekey: "smith2024",
			reviewed: true,
			priority: 5,
		});
	});

	it("omits customMetadata when no custom fields are set", async () => {
		const mockResult = {
			success: true,
			id: 1,
			uuid: "test-uuid",
			name: "Test",
			path: "/test",
			location: "/",
			recordType: "markdown",
			kind: "Markdown",
			creationDate: "2024-01-01",
			modificationDate: "2024-01-02",
			additionDate: "2024-01-01",
			size: 100,
			tags: [],
			comment: "",
			url: "",
			rating: 0,
			label: 0,
			flag: false,
			unread: false,
			locked: false,
			wordCount: 10,
			characterCount: 50,
		};
		executeJxaMock.mockResolvedValue(mockResult);

		const result = await getRecordPropertiesTool.run?.({
			uuid: "test-uuid",
		});

		expect(result).toBeDefined();
		expect(result.success).toBe(true);
		expect(result.customMetadata).toBeUndefined();
	});

	it("includes custom metadata reading code in the JXA script", async () => {
		executeJxaMock.mockResolvedValue({ success: true });

		await getRecordPropertiesTool.run?.({ uuid: "test-uuid" });

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).toContain("customMetaData()");
		expect(script).toContain('k.startsWith("md")');
		expect(script).toContain("k.slice(2)");
		expect(script).toContain("properties.customMetadata");
	});
});
