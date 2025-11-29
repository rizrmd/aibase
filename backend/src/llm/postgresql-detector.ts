import { testPostgreSQLConnection } from "../tools/runtime/postgresql";
import { MemoryTool } from "../tools/definition/memory-tool";

/**
 * Detect PostgreSQL URLs in a message and test/store them in memory
 * Pattern matches: postgresql://, postgres://, or pg://
 */
export async function detectAndStorePostgreSQLUrl(
  message: string,
  projectId: string = "default"
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

    // Store in memory (use update to overwrite if exists, or add if new)
    const memoryTool = new MemoryTool();
    memoryTool.setProjectId(projectId);

    try {
      // Try to read existing value first
      await memoryTool.execute({
        action: "read",
        category: "database",
        key: "postgresql_url",
      });

      // If we got here, key exists - update it
      await memoryTool.execute({
        action: "update",
        category: "database",
        key: "postgresql_url",
        value: connectionUrl,
      });

      console.log(`[PostgreSQL] Connection URL updated in memory at database.postgresql_url`);
    } catch (error) {
      // Key doesn't exist - add it
      await memoryTool.execute({
        action: "add",
        category: "database",
        key: "postgresql_url",
        value: connectionUrl,
      });

      console.log(`[PostgreSQL] Connection URL stored in memory at database.postgresql_url`);
    }

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
