
import { generateConversationTitle } from "./backend/src/llm/conversation-title-generator";
import { loadConversationInfo } from "./backend/src/llm/conversation-info";
import * as fs from "fs/promises";
import * as path from "path";

async function testTitleGeneration() {
    const projectId = "test_project";
    const convId = "test_conv_" + Date.now();
    const testDir = path.join(process.cwd(), "data", projectId, convId);

    // Ensure test directory exists
    await fs.mkdir(testDir, { recursive: true });

    // Create dummy info.json
    await fs.writeFile(
        path.join(testDir, "info.json"),
        JSON.stringify({
            convId,
            projectId,
            createdAt: Date.now(),
            lastUpdatedAt: Date.now(),
            totalMessages: 0,
            tokenUsage: { total: { promptTokens: 0, completionTokens: 0, totalTokens: 0, timestamp: Date.now() }, history: [] }
        }),
        "utf-8"
    );

    console.log(`Created test environment at ${testDir}`);

    // Test case 1: Very Short conversation (fallback to user message)
    // "Hi" is 2 chars. "user: Hi" is 8 chars. < 10.
    const shortMessages: any[] = [
        { role: "user", content: "Hi" }
    ];

    console.log("Testing short conversation fallback...");
    const title1 = await generateConversationTitle(shortMessages, convId, projectId);
    console.log(`Generated title 1: "${title1}"`);

    // Verify it was saved
    const info1 = await loadConversationInfo(convId, projectId);
    if (info1?.title === "Hi") {
        console.log("✅ Success: Title 'Hi' was saved for short conversation.");
    } else {
        console.error(`❌ Failure: Expected title 'Hi', got '${info1?.title}'`);
    }

    // Cleanup
    await fs.rm(path.join(process.cwd(), "data", projectId), { recursive: true, force: true });
}

testTitleGeneration().catch(console.error);
