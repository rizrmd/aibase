import { SQL } from "bun";
import { MemoryTool } from "../definition/memory-tool.ts";

/**
 * PostgreSQL query options
 */
export interface PostgreSQLOptions {
  /** SQL query to execute */
  query: string;
  /** Optional connection URL (if not provided, reads from memory tool) */
  connectionUrl?: string;
  /** Return format: 'json' (default), 'raw' */
  format?: "json" | "raw";
  /** Query timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Memory category to read connection URL from (required when connectionUrl not provided) */
  memoryCategory?: string;
  /** Memory key to read connection URL from (required when connectionUrl not provided) */
  memoryKey?: string;
}

/**
 * PostgreSQL query result
 */
export interface PostgreSQLResult {
  /** Query results as array of objects */
  data?: any[];
  /** Raw result (when format is 'raw') */
  raw?: any;
  /** Number of rows returned */
  rowCount?: number;
  /** Execution time in milliseconds */
  executionTime?: number;
  /** Query executed */
  query?: string;
}

/**
 * Create a PostgreSQL query function that reads connection URL from memory tool
 *
 * Uses Bun's native SQL API for PostgreSQL database queries.
 * Connection URL can be read from memory by specifying memoryCategory and memoryKey,
 * or provided directly via connectionUrl parameter.
 *
 * Usage in script tool:
 *
 * // 1. First, store the PostgreSQL connection URL in memory:
 * await memory({
 *   action: 'set',
 *   category: 'database',
 *   key: 'postgresql_url',
 *   value: 'postgresql://user:password@localhost:5432/mydb'
 * });
 *
 * // 2. Query the database (connection URL read from memory):
 * const users = await postgresql({
 *   query: 'SELECT * FROM users WHERE active = true LIMIT 10',
 *   memoryCategory: 'database',
 *   memoryKey: 'postgresql_url'
 * });
 * console.log(`Found ${users.rowCount} users`);
 * console.log(users.data); // Array of user objects
 *
 * // 3. Query with aggregation:
 * const stats = await postgresql({
 *   query: 'SELECT status, COUNT(*) as count FROM orders GROUP BY status',
 *   memoryCategory: 'database',
 *   memoryKey: 'postgresql_url'
 * });
 *
 * // 4. Override connection URL (bypass memory):
 * const products = await postgresql({
 *   query: 'SELECT * FROM products WHERE price > 100',
 *   connectionUrl: 'postgresql://user:pass@another-host:5432/shop'
 * });
 *
 * // 5. Query with custom timeout:
 * const large = await postgresql({
 *   query: 'SELECT * FROM large_table',
 *   memoryCategory: 'database',
 *   memoryKey: 'postgresql_url',
 *   timeout: 60000 // 60 seconds
 * });
 *
 * @param projectId - Project ID for memory tool (injected automatically in script runtime)
 */
export function createPostgreSQLFunction(projectId?: string) {
  return async (options: PostgreSQLOptions): Promise<PostgreSQLResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "postgresql requires an options object. Usage: postgresql({ query: 'SELECT * FROM users' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "postgresql requires 'query' parameter. Usage: postgresql({ query: 'SELECT * FROM users' })"
      );
    }

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      // Get connection URL
      let connectionUrl = options.connectionUrl;

      // If not provided, read from memory tool
      if (!connectionUrl) {
        // Require memoryCategory and memoryKey when reading from memory
        if (!options.memoryCategory || !options.memoryKey) {
          throw new Error(
            "postgresql requires 'memoryCategory' and 'memoryKey' parameters when 'connectionUrl' is not provided. " +
            "Usage: postgresql({ query: '...', memoryCategory: 'database', memoryKey: 'postgresql_url' })"
          );
        }

        const memoryCategory = options.memoryCategory;
        const memoryKey = options.memoryKey;
        const memoryTool = new MemoryTool();
        if (projectId) {
          memoryTool.setProjectId(projectId);
        }

        try {
          const result = await memoryTool.execute({
            action: "read",
            category: memoryCategory,
            key: memoryKey,
          });

          // Parse the result to extract the connection URL
          const parsed = JSON.parse(result);
          connectionUrl = parsed.value;

          if (!connectionUrl) {
            throw new Error(
              `Connection URL not found in memory at ${memoryCategory}.${memoryKey}`
            );
          }
        } catch (error: any) {
          throw new Error(
            `Failed to read PostgreSQL connection URL from memory (${memoryCategory}.${memoryKey}): ${error.message}. ` +
            `Please store it using: memory({ action: 'set', category: '${memoryCategory}', key: '${memoryKey}', value: 'postgresql://...' })`
          );
        }
      }

      // Create PostgreSQL connection using Bun's SQL
      const db = new SQL(connectionUrl);

      // Execute query with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
      );

      // Execute the query using Bun's SQL API
      // We need to use the unsafe method for dynamic query strings
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

        return {
          data: dataArray,
          rowCount: dataArray.length,
          executionTime,
          query: options.query,
        };
      } else {
        // Return raw result
        return {
          raw: result,
          rowCount: Array.isArray(result) ? result.length : undefined,
          executionTime,
          query: options.query,
        };
      }
    } catch (error: any) {
      // Improve error messages
      const executionTime = Date.now() - startTime;

      // Check for common errors
      if (error.message?.includes("ENOTFOUND") || error.message?.includes("ECONNREFUSED")) {
        throw new Error(
          `PostgreSQL connection failed: Unable to connect to database. Check your connection URL and ensure the database is running. ${error.message}`
        );
      }

      if (error.message?.includes("password authentication failed")) {
        throw new Error(
          `PostgreSQL authentication failed: Invalid credentials in connection URL. ${error.message}`
        );
      }

      if (error.message?.includes("does not exist")) {
        throw new Error(
          `PostgreSQL query error: ${error.message}. Check that tables/columns exist.`
        );
      }

      if (error.message?.includes("syntax error")) {
        throw new Error(
          `PostgreSQL syntax error: ${error.message}. Check your SQL query syntax.`
        );
      }

      throw new Error(`PostgreSQL query failed (${executionTime}ms): ${error.message}`);
    }
  };
}

/**
 * Helper function to test PostgreSQL connection
 */
export async function testPostgreSQLConnection(
  connectionUrl?: string,
  projectId?: string
): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const pgQuery = createPostgreSQLFunction(projectId);
    const result = await pgQuery({
      query: "SELECT version()",
      connectionUrl,
    });

    return {
      connected: true,
      version: result.data?.[0]?.version,
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Helper function to execute a simple SELECT query
 */
export function queryPostgreSQL(
  table: string,
  options?: {
    where?: string;
    limit?: number;
    orderBy?: string;
    connectionUrl?: string;
    projectId?: string;
  }
) {
  const where = options?.where ? `WHERE ${options.where}` : "";
  const orderBy = options?.orderBy ? `ORDER BY ${options.orderBy}` : "";
  const limit = options?.limit ? `LIMIT ${options.limit}` : "";

  const query = `SELECT * FROM ${table} ${where} ${orderBy} ${limit}`.trim();

  return createPostgreSQLFunction(options?.projectId)({
    query,
    connectionUrl: options?.connectionUrl,
  });
}
