import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeJxaMock } = vi.hoisted(() => ({
	executeJxaMock: vi.fn(),
}));

vi.mock("../../src/applescript/execute.js", () => ({
	executeJxa: executeJxaMock,
}));

import { importFileTool } from "../../src/tools/importFile.js";

describe("importFileTool", () => {
	beforeEach(() => {
		executeJxaMock.mockReset();
	});

	it("builds an importPath JXA script and returns the executor result", async () => {
		const mockResult = {
			success: true,
			recordId: 42,
			name: "Imported Record",
			uuid: "1234-5678",
		};
		executeJxaMock.mockResolvedValue(mockResult);

		const result = await importFileTool.run?.({
			filePath: "/tmp/test document.txt",
			name: "Renamed Import",
			databaseName: "Inbox",
		});

		expect(result).toEqual(mockResult);
		expect(executeJxaMock).toHaveBeenCalledTimes(1);

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).toContain('const pFilePath = "/tmp/test document.txt";');
		expect(script).toContain('const pName = "Renamed Import";');
		expect(script).toContain('const pDatabaseName = "Inbox";');
		expect(script).toContain("destinationGroup = targetDatabase.incomingGroup();");
		expect(script).toContain("const imported = theApp.importPath(pFilePath, options);");
	});

	it("defaults to the global inbox when no destination is provided", async () => {
		executeJxaMock.mockResolvedValue({ success: true });

		await importFileTool.run?.({
			filePath: "/tmp/probe.txt",
		});

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).toContain("const inboxDatabase = theApp.inbox();");
		expect(script).toContain('throw new Error("Global inbox database not available");');
		expect(script).toContain("destinationGroup = inboxDatabase.root();");
	});

	it("uses an explicit parent group when parentGroupUuid is provided", async () => {
		executeJxaMock.mockResolvedValue({ success: true });

		await importFileTool.run?.({
			filePath: "/tmp/probe.txt",
			parentGroupUuid: "ABC-123",
		});

		const [script] = executeJxaMock.mock.calls[0];
		expect(script).toContain('const pParentGroupUuid = "ABC-123";');
		expect(script).toContain("destinationGroup = theApp.getRecordWithUuid(pParentGroupUuid);");
		expect(script).toContain(
			'throw new Error("Parent group with UUID not found: " + pParentGroupUuid);',
		);
	});

	it("rejects invalid file paths before invoking JXA", async () => {
		const result = await importFileTool.run?.({
			filePath: "bad\u0000path",
		});

		expect(result).toEqual({
			success: false,
			error: "File path contains invalid characters",
		});
		expect(executeJxaMock).not.toHaveBeenCalled();
	});
});
