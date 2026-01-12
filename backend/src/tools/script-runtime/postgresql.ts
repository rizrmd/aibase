import { SQL } from "bun";

/**
 * Context documentation for PostgreSQL functionality
 */
export const context = async () => {
  return `### POSTGRESQL QUERIES

Use postgresql() for direct PostgreSQL database queries.

**IMPORTANT:** Use postgresql(), NOT DuckDB for PostgreSQL databases!

**Available:** postgresql({ query, connectionUrl, format?, timeout? })

**SECURITY:** Store credentials in memory and use \`memory.read()\` function!

#### EXAMPLES

\`\`\`typescript
// RECOMMENDED: Store credentials in memory first (do this once):
await memory({
  action: 'set',
  category: 'database',
  key: 'postgresql_url',
  value: 'postgresql://user:pass@localhost:5432/mydb'
});

// Then use memory.read() to get the credential (CLEAR and type-safe):
progress('Querying PostgreSQL...');
const result = await postgresql({
  query: 'SELECT * FROM users WHERE active = true LIMIT 10',
  connectionUrl: memory.read('database', 'postgresql_url')  // Function call - type-safe!
});
progress(\`Found \${result.rowCount} users\`);
return { count: result.rowCount, users: result.data };

// Query with aggregation (using memory.read())
progress('Analyzing orders...');
const stats = await postgresql({
  query: 'SELECT status, COUNT(*) as count, SUM(total) as revenue FROM orders GROUP BY status ORDER BY revenue DESC',
  connectionUrl: memory.read('database', 'postgresql_url')
});
return { breakdown: stats.data, totalStatuses: stats.rowCount };

// Query with custom timeout (using memory.read())
progress('Querying large table...');
const products = await postgresql({
  query: 'SELECT * FROM products WHERE price > 100 ORDER BY price DESC',
  connectionUrl: memory.read('database', 'postgresql_url'),
  timeout: 60000
});
return { products: products.rowCount, data: products.data };
\`\`\``
};

/**
 * PostgreSQL query options
 */
export interface PostgreSQLOptions {
  /** SQL query to execute */
  query: string;
  /** PostgreSQL connection URL (use memory.read('database', 'postgresql_url') for secure credentials) */
  connectionUrl: string;
  /** Return format: 'json' (default), 'raw' */
  format?: "json" | "raw";
  /** Query timeout in milliseconds (default: 30000) */
  timeout?: number;
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
 * Create a PostgreSQL query function for secure database queries
 *
 * Uses Bun's native SQL API for PostgreSQL database queries.
 *
 * Credentials should be stored in memory and accessed via memory.read():
 * await memory({ action: 'set', category: 'database', key: 'postgresql_url', value: 'postgresql://...' });
 *
 * Usage in script tool:
 *
 * // RECOMMENDED: Query using memory.read() for credentials:
 * const users = await postgresql({
 *   query: 'SELECT * FROM users WHERE active = true LIMIT 10',
 *   connectionUrl: memory.read('database', 'postgresql_url')
 * });
 * console.log(`Found ${users.rowCount} users`);
 * console.log(users.data); // Array of user objects
 *
 * // Query with aggregation:
 * const stats = await postgresql({
 *   query: 'SELECT status, COUNT(*) as count FROM orders GROUP BY status',
 *   connectionUrl: memory.read('database', 'postgresql_url')
 * });
 *
 * // Query with custom timeout:
 * const large = await postgresql({
 *   query: 'SELECT * FROM large_table',
 *   connectionUrl: memory.read('database', 'postgresql_url'),
 *   timeout: 60000 // 60 seconds
 * });
 */
export function createPostgreSQLFunction() {
  return async (options: PostgreSQLOptions): Promise<PostgreSQLResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "postgresql requires an options object. Usage: postgresql({ query: 'SELECT * FROM users', connectionUrl: memory.read('database', 'postgresql_url') })"
      );
    }

    if (!options.query) {
      throw new Error(
        "postgresql requires 'query' parameter. Usage: postgresql({ query: 'SELECT * FROM users', connectionUrl: memory.read('database', 'postgresql_url') })"
      );
    }

    if (!options.connectionUrl) {
      throw new Error(
        "postgresql requires 'connectionUrl' parameter. " +
        "Use memory.read(): connectionUrl: memory.read('database', 'postgresql_url') or direct URL: 'postgresql://user:pass@host:5432/db'"
      );
    }

    const connectionUrl = options.connectionUrl;

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      const connectionUrl = options.connectionUrl;

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
  connectionUrl: string
): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const pgQuery = createPostgreSQLFunction();
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
  connectionUrl: string,
  options?: {
    where?: string;
    limit?: number;
    orderBy?: string;
  }
) {
  const where = options?.where ? `WHERE ${options.where}` : "";
  const orderBy = options?.orderBy ? `ORDER BY ${options.orderBy}` : "";
  const limit = options?.limit ? `LIMIT ${options.limit}` : "";

  const query = `SELECT * FROM ${table} ${where} ${orderBy} ${limit}`.trim();

  return createPostgreSQLFunction()({
    query,
    connectionUrl,
  });
}
