import { testPostgreSQLConnection } from "../tools/runtime/postgresql";
import { MemoryTool } from "../tools/definition/memory-tool";

/**
 * Detect PostgreSQL URLs in a message and test/store them in memory
 * Pattern matches: postgresql://, postgres://, or pg://
 */
export async function detectAndStorePostgreSQLUrl(
  message: string,
  projectId: string = "A1"
): Promise<{ detected: boolean; tested: boolean; stored: boolean; error?: string }> {
  // Regex to match PostgreSQL connection URLs
  const pgUrlPattern = /\b(postgres(?:ql)?|pg):\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = message.match(pgUrlPattern);

  if (!matches || matches.length === 0) {
    return { detected: false, tested: false, stored: false };
  }

  // Take the first match
  const connectionUrl = matches[0];
  console.log(`[PostgreSQL] Detected connection URL in message`);

  try {
    // Test the connection
    console.log(`[PostgreSQL] Testing connection...`);
    const testResult = await testPostgreSQLConnection(connectionUrl, projectId);

    if (!testResult.connected) {
      console.log(`[PostgreSQL] Connection test failed: ${testResult.error}`);
      return {
        detected: true,
        tested: false,
        stored: false,
        error: testResult.error,
      };
    }

    console.log(`[PostgreSQL] Connection successful! Version: ${testResult.version}`);

    // Store in memory (set will create or update as needed)
    const memoryTool = new MemoryTool();
    memoryTool.setProjectId(projectId);

    await memoryTool.execute({
      action: "set",
      category: "database",
      key: "postgresql_url",
      value: connectionUrl,
    });

    console.log(`[PostgreSQL] Connection URL stored in memory at database.postgresql_url`);

    return {
      detected: true,
      tested: true,
      stored: true,
    };
  } catch (error: any) {
    console.log(`[PostgreSQL] Error during test/store: ${error.message}`);
    return {
      detected: true,
      tested: false,
      stored: false,
      error: error.message,
    };
  }
}
