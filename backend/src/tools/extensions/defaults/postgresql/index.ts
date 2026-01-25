/**
 * PostgreSQL Extension
 * Query PostgreSQL databases with secure connection management
 */

// Type definitions
interface PostgreSQLOptions {
  query: string;
  connectionUrl: string;
  format?: "json" | "raw";
  timeout?: number;
}

interface PostgreSQLJSONResult {
  data: Array<Record<string, unknown>>;
  rowCount: number;
  executionTime: number;
  query: string;
}

interface PostgreSQLRawResult {
  raw: unknown;
  executionTime: number;
  query: string;
}

// Extend globalThis for inspection broadcasting
declare global {
  var __broadcastInspection: ((extension: string, data: Record<string, unknown>) => void) | undefined;
}

/**
 * Context documentation for the PostgreSQL extension
 */
const context = () =>
  '' +
  '### PostgreSQL Extension' +
  '' +
  'Query PostgreSQL databases with secure credential management.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### postgresql(options)' +
  'Execute a PostgreSQL query and return results.' +
  '`' + '`' + '`' + 'typescript' +
  'await postgresql({' +
  '  query: "SELECT * FROM users WHERE active = true LIMIT 10",' +
  '  connectionUrl: "postgresql://user:pass@host:5432/database",' +
  '  format: "json",     // Optional: "json" (default) or "raw"' +
  '  timeout: 30000      // Optional: timeout in milliseconds (default: 30000)' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`query\\` (required): SQL query to execute' +
  '- \\`connectionUrl\\` (required): PostgreSQL connection string' +
  '- \\`format\\` (optional): "json" (default) or "raw"' +
  '- \\`timeout\\` (optional): Query timeout in milliseconds (default: 30000)' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  data: Array<any>,       // Result rows' +
  '  rowCount: number,       // Number of rows returned' +
  '  executionTime: number,  // Execution time in milliseconds' +
  '  query: string           // The executed query' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Simple query with connection URL:**' +
  '`' + '`' + '`' + 'typescript' +
  'const users = await postgresql({' +
  '  query: "SELECT * FROM users LIMIT 10",' +
  '  connectionUrl: "postgresql://user:pass@localhost:5432/mydb"' +
  '});' +
  'return { count: users.rowCount, data: users.data };' +
  '`' + '`' + '`' +
  '' +
  '2. **Using memory for secure credentials (recommended):**' +
  '`' + '`' + '`' + 'typescript' +
  '// First, store credentials securely (do this once)' +
  'await memory({' +
  '  action: \'set\',' +
  '  category: \'database\',' +
  '  key: \'postgresql_url\',' +
  '  value: \'postgresql://user:pass@localhost:5432/mydb\'' +
  '});' +
  '' +
  '// Then use the stored credential' +
  'const result = await postgresql({' +
  '  query: "SELECT name, email FROM users WHERE active = true",' +
  '  connectionUrl: memory.read(\'database\', \'postgresql_url\')' +
  '});' +
  'return result.data;' +
  '`' + '`' + '`' +
  '' +
  '3. **Aggregate query:**' +
  '`' + '`' + '`' + 'typescript' +
  'const stats = await postgresql({' +
  '  query: \\`SELECT' +
  '    status,' +
  '    COUNT(*) as count' +
  '  FROM orders' +
  '  GROUP BY status' +
  '  ORDER BY count DESC\\`,' +
  '  connectionUrl: memory.read(\'database\', \'postgresql_url\')' +
  '});' +
  'return stats.data;' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Always store connection URLs in memory using the memory tool for security' +
  '- Never hardcode credentials directly in script code' +
  '- Use the format parameter to control output structure' +
  '- The extension uses Bun\'s SQL driver for better performance';

/**
 * PostgreSQL extension
 */
const postgresqlExtension = {
  /**
   * Query PostgreSQL database
   *
   * Usage:
   * const result = await postgresql({
   *   query: 'SELECT * FROM users WHERE active = true LIMIT 10',
   *   connectionUrl: memory.read('database', 'postgresql_url')
   * });
   */
  postgresql: async (options: PostgreSQLOptions): Promise<PostgreSQLJSONResult | PostgreSQLRawResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "postgresql requires an options object. Usage: await postgresql({ query: 'SELECT * FROM users', connectionUrl: '...' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "postgresql requires 'query' parameter. Usage: await postgresql({ query: 'SELECT * FROM users', connectionUrl: '...' })"
      );
    }

    if (!options.connectionUrl) {
      throw new Error(
        "postgresql requires 'connectionUrl' parameter"
      );
    }

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      // Import SQL dynamically
      const { SQL } = await import('bun');

      // Create PostgreSQL connection using Bun's SQL
      const db = new SQL(options.connectionUrl);

      // Execute query with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
      );

      // Execute the query using Bun's SQL API
      const queryPromise = (async () => {
        return await db.unsafe(options.query);
      })();

      const result = await Promise.race([
        queryPromise,
        timeoutPromise,
      ]);

      const executionTime = Date.now() - startTime;

      // Return results based on format
      if (format === "json") {
        // Bun's SQL returns arrays of objects
        const dataArray = Array.isArray(result) ? result : [result];

        const extensionResult = {
          data: dataArray,
          rowCount: dataArray.length,
          executionTime,
          query: options.query,
        };

        // Broadcast inspection data if __broadcastInspection is available
        if (globalThis.__broadcastInspection) {
          globalThis.__broadcastInspection('postgresql', {
            ...extensionResult,
          });
        }

        return extensionResult;
      } else {
        // Raw format
        const extensionResult = {
          raw: result,
          executionTime,
          query: options.query,
        };

        if (globalThis.__broadcastInspection) {
          globalThis.__broadcastInspection('postgresql', {
            ...extensionResult,
          });
        }

        return extensionResult;
      }
    } catch (error: unknown) {
      throw new Error(`PostgreSQL query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

return postgresqlExtension;
