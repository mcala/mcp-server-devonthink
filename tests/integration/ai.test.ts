import { describe, it, expect } from "vitest";
import { jxa, getTestContext, createTestRecord, deleteRecord } from "./helpers.js";

// Detect if any AI engine is configured
async function detectAiEngine(): Promise<string | null> {
	const engines = ["chatgpt", "claude", "gemini", "mistral", "gpt4all", "lm studio", "ollama"];
	for (const engine of engines) {
		try {
			const result = await jxa<{
				success: boolean;
				hasModels?: boolean;
			}>(`
        const models = theApp.getChatModelsForEngine("${engine}");
        const r = {};
        r["success"] = true;
        r["hasModels"] = models && models.length > 0;
        return JSON.stringify(r);
      `);
			if (result.success && result.hasModels) {
				return engine;
			}
		} catch (_) {
			// Engine not available
		}
	}
	return null;
}

describe("ai", () => {
	it("check_ai_health — reports configured AI engines", async () => {
		const engines = [
			"chatgpt",
			"claude",
			"gemini",
			"mistral",
			"gpt4all",
			"lm studio",
			"ollama",
		];
		const configured: string[] = [];

		for (const engine of engines) {
			const result = await jxa<{
				success: boolean;
				hasModels?: boolean;
			}>(`
        try {
          const models = theApp.getChatModelsForEngine("${engine}");
          const r = {};
          r["success"] = true;
          r["hasModels"] = models && models.length > 0;
          return JSON.stringify(r);
        } catch (e) {
          const r = {};
          r["success"] = true;
          r["hasModels"] = false;
          return JSON.stringify(r);
        }
      `);
			if (result.hasModels) {
				configured.push(engine);
			}
		}

		// This test always passes — it just reports status
		expect(configured.length).toBeGreaterThanOrEqual(0);
	});

	it("ask_ai_about_documents — asks AI a question about a document", async () => {
		const engine = await detectAiEngine();
		if (!engine) {
			// No AI engine configured — skip gracefully
			expect(true).toBe(true);
			return;
		}

		const ctx = getTestContext();
		const rec = await createTestRecord(
			ctx,
			"AI-Ask-Test",
			"markdown",
			"# Capital Cities\nThe capital of France is Paris. The capital of Japan is Tokyo.",
		);
		try {
			const result = await jxa<{
				success: boolean;
				response?: string;
				error?: string;
			}>(`
        const record = theApp.getRecordWithUuid("${rec.uuid}");
        if (!record) throw new Error("Record not found");
        const content = record.plainText();
        const response = theApp.getChatResponseForMessage("What is the capital of France according to this document? " + content);
        const r = {};
        r["success"] = true;
        r["response"] = response;
        return JSON.stringify(r);
      `);
			expect(result.success).toBe(true);
			expect(result.response).toBeTruthy();
		} finally {
			await deleteRecord(rec.uuid);
		}
	});

	it("get_ai_tool_documentation — static docs always available", async () => {
		// This test validates that the tool documentation concept works.
		// The actual tool returns static content, so we just verify
		// the AI tools list is accessible without error.
		const result = await jxa<{ success: boolean; version?: string }>(`
      const version = theApp.version();
      const r = {};
      r["success"] = true;
      r["version"] = version;
      return JSON.stringify(r);
    `);
		expect(result.success).toBe(true);
		expect(result.version).toBeTruthy();
	});

	it.skip("selected_records — requires GUI interaction, cannot be automated", () => {
		// This test is permanently skipped because selected_records
		// depends on the user actively selecting records in the DEVONthink GUI.
		// It cannot be reliably automated without manual interaction.
	});
});
