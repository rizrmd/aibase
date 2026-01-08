/**
 * Context documentation for ClickHouse functionality
 */
export const context = async () => {
  return `### CLICKHOUSE QUERIES

Use clickhouse() for ClickHouse database queries.

**IMPORTANT:** Use clickhouse() for ClickHouse databases!

**Available:** clickhouse({ query, serverUrl, database?, username?, password?, format?, timeout?, params? })

**SECURITY:** Store credentials in memory and use \`memory.read()\` function!

#### EXAMPLES

\`\`\`typescript
// RECOMMENDED: Store credentials in memory first (do this once):
await memory({ action: 'set', category: 'database', key: 'clickhouse_url', value: 'http://localhost:8123' });
await memory({ action: 'set', category: 'database', key: 'clickhouse_database', value: 'analytics' });
await memory({ action: 'set', category: 'database', key: 'clickhouse_username', value: 'default' });
await memory({ action: 'set', category: 'database', key: 'clickhouse_password', value: '' });

// Then use memory.read() to get credentials (CLEAR and type-safe):
progress('Querying ClickHouse...');
const result = await clickhouse({
  query: 'SELECT event_type, COUNT(*) as count FROM events WHERE date >= today() - 7 GROUP BY event_type ORDER BY count DESC LIMIT 10',
  serverUrl: memory.read('database', 'clickhouse_url'),      // Function call - type-safe!
  database: memory.read('database', 'clickhouse_database'),  // Function call - type-safe!
  username: memory.read('database', 'clickhouse_username'),  // Function call - type-safe!
  password: memory.read('database', 'clickhouse_password')   // Function call - type-safe!
});
progress(\`Found \${result.rowCount} event types\`);
return { count: result.rowCount, events: result.data };

// Query with time-series aggregation (using memory.read())
progress('Analyzing user activity...');
const stats = await clickhouse({
  query: 'SELECT toDate(timestamp) as date, COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_events FROM user_events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY date ORDER BY date',
  serverUrl: memory.read('database', 'clickhouse_url')
});
return { days: stats.rowCount, dailyStats: stats.data };

// Query with parameters (using memory.read())
progress('Querying with parameters...');
const filtered = await clickhouse({
  query: 'SELECT * FROM users WHERE age > {minAge:UInt8} AND country = {country:String} LIMIT {limit:UInt16}',
  serverUrl: memory.read('database', 'clickhouse_url'),
  params: { minAge: 25, country: 'US', limit: 100 }
});
return { users: filtered.rowCount, data: filtered.data };

// ALTERNATIVE: Direct credentials (credentials visible in code)
const direct = await clickhouse({
  query: 'SELECT * FROM items',
  serverUrl: 'http://localhost:8123',
  database: 'shop',
  username: 'user',
  password: 'pass'
});
\`\`\``
};

/**
 * ClickHouse query options
 */
export interface ClickHouseOptions {
  /** SQL query to execute */
  query: string;
  /** ClickHouse server URL (use memory.read('database', 'clickhouse_url') for secure credentials) */
  serverUrl: string;
  /** Database to query (use memory.read('database', 'clickhouse_database') for secure credentials) */
  database?: string;
  /** Username for authentication (use memory.read('database', 'clickhouse_username') for secure credentials) */
  username?: string;
  /** Password for authentication (use memory.read('database', 'clickhouse_password') for secure credentials) */
  password?: string;
  /** Return format: 'json' (default), 'raw', 'csv', 'tsv' */
  format?: "json" | "raw" | "csv" | "tsv";
  /** Query timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Additional query parameters */
  params?: Record<string, any>;
}

/**
 * ClickHouse query result
 */
export interface ClickHouseResult {
  /** Query results as array of objects */
  data?: any[];
  /** Raw result (when format is 'raw', 'csv', or 'tsv') */
  raw?: any;
  /** Number of rows returned */
  rowCount?: number;
  /** Execution time in milliseconds */
  executionTime?: number;
  /** Query executed */
  query?: string;
  /** Query statistics from ClickHouse */
  stats?: {
    rows_read?: number;
    bytes_read?: number;
    elapsed?: number;
  };
}

/**
 * Create a ClickHouse query function for fast columnar database queries
 *
 * Uses ClickHouse's HTTP interface for fast columnar database queries.
 *
 * Credentials should be stored in memory and accessed via memory.read():
 * await memory({ action: 'set', category: 'database', key: 'clickhouse_url', value: 'http://...' });
 * await memory({ action: 'set', category: 'database', key: 'clickhouse_database', value: 'analytics' });
 * await memory({ action: 'set', category: 'database', key: 'clickhouse_username', value: 'default' });
 * await memory({ action: 'set', category: 'database', key: 'clickhouse_password', value: 'secret' });
 *
 * Usage in script tool:
 *
 * // RECOMMENDED: Query using memory.read() for credentials:
 * const results = await clickhouse({
 *   query: 'SELECT * FROM users WHERE active = 1 LIMIT 10',
 *   serverUrl: memory.read('database', 'clickhouse_url'),
 *   database: memory.read('database', 'clickhouse_database')
 * });
 * console.log(`Found ${results.rowCount} users`);
 * console.log(results.data);
 *
 * // Query with aggregation:
 * const stats = await clickhouse({
 *   query: 'SELECT status, COUNT(*) as count FROM orders GROUP BY status',
 *   serverUrl: memory.read('database', 'clickhouse_url')
 * });
 *
 * // Query with parameters:
 * const filtered = await clickhouse({
 *   query: 'SELECT * FROM users WHERE age > {age:UInt8} LIMIT 10',
 *   serverUrl: memory.read('database', 'clickhouse_url'),
 *   params: { age: 25 }
 * });
 */
export function createClickHouseFunction() {
  return async (options: ClickHouseOptions): Promise<ClickHouseResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "clickhouse requires an options object. Usage: clickhouse({ query: 'SELECT * FROM table', serverUrl: memory.read('database', 'clickhouse_url') })"
      );
    }

    if (!options.query) {
      throw new Error(
        "clickhouse requires 'query' parameter. Usage: clickhouse({ query: 'SELECT * FROM table', serverUrl: memory.read('database', 'clickhouse_url') })"
      );
    }

    if (!options.serverUrl) {
      throw new Error(
        "clickhouse requires 'serverUrl' parameter. " +
        "Use memory.read(): serverUrl: memory.read('database', 'clickhouse_url') or direct URL: 'http://localhost:8123'"
      );
    }

    const serverUrl = options.serverUrl;
    const database = options.database;
    const username = options.username;
    const password = options.password;

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      const cleanServerUrl = serverUrl.replace(/\/$/, ""); // Remove trailing slash

      // Build URL with query parameters
      const url = new URL(cleanServerUrl);

      // Set database if provided
      if (database) {
        url.searchParams.set("database", database);
      }

      // Set format based on requested format
      if (format === "json") {
        url.searchParams.set("default_format", "JSONEachRow");
      } else if (format === "csv") {
        url.searchParams.set("default_format", "CSV");
      } else if (format === "tsv") {
        url.searchParams.set("default_format", "TSV");
      }

      // Add custom parameters
      if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
          url.searchParams.set(`param_${key}`, String(value));
        }
      }

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
      };

      // Add basic auth if credentials are provided
      if (username || password) {
        const credentials = btoa(
          `${username || "default"}:${password || ""}`
        );
        headers["Authorization"] = `Basic ${credentials}`;
      }

      // Execute query with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url.toString(), {
          method: "POST",
          headers,
          body: options.query,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `ClickHouse query failed with status ${response.status}: ${errorText}`
          );
        }

        const executionTime = Date.now() - startTime;

        // Parse response based on format
        if (format === "json") {
          const text = await response.text();

          // Parse JSONEachRow format (one JSON object per line)
          const dataArray: any[] = [];
          if (text.trim()) {
            const lines = text.trim().split("\n");
            for (const line of lines) {
              if (line.trim()) {
                try {
                  dataArray.push(JSON.parse(line));
                } catch (e) {
                  // Skip invalid JSON lines
                }
              }
            }
          }

          // Try to extract stats from response headers
          const stats: any = {};
          const rowsRead = response.headers.get("X-ClickHouse-Summary");
          if (rowsRead) {
            try {
              const summary = JSON.parse(rowsRead);
              stats.rows_read = summary.read_rows;
              stats.bytes_read = summary.read_bytes;
              stats.elapsed = summary.elapsed;
            } catch (e) {
              // Ignore parsing errors
            }
          }

          return {
            data: dataArray,
            rowCount: dataArray.length,
            executionTime,
            query: options.query,
            stats: Object.keys(stats).length > 0 ? stats : undefined,
          };
        } else if (format === "csv" || format === "tsv" || format === "raw") {
          // Return raw text for CSV, TSV, or raw format
          const raw = await response.text();

          return {
            raw,
            rowCount: raw.split("\n").filter((line) => line.trim()).length,
            executionTime,
            query: options.query,
          };
        } else {
          // Fallback to raw text
          const raw = await response.text();

          return {
            raw,
            executionTime,
            query: options.query,
          };
        }
      } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === "AbortError") {
          throw new Error(`Query timeout after ${timeout}ms`);
        }

        throw error;
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Check for common errors
      if (error.message?.includes("fetch failed") || error.message?.includes("ECONNREFUSED")) {
        throw new Error(
          `ClickHouse connection failed: Unable to connect to server at ${serverUrl}. Check your server URL and ensure ClickHouse is running. ${error.message}`
        );
      }

      if (
        error.message?.includes("401") ||
        error.message?.includes("403") ||
        error.message?.includes("Authentication failed")
      ) {
        throw new Error(
          `ClickHouse authentication failed: Invalid credentials. ${error.message}`
        );
      }

      if (
        error.message?.includes("doesn't exist") ||
        error.message?.includes("Unknown table") ||
        error.message?.includes("Unknown database")
      ) {
        throw new Error(
          `ClickHouse query error: ${error.message}. Check that database/tables/columns exist.`
        );
      }

      if (
        error.message?.includes("Syntax error") ||
        error.message?.includes("Cannot parse")
      ) {
        throw new Error(
          `ClickHouse syntax error: ${error.message}. Check your SQL query syntax.`
        );
      }

      throw new Error(`ClickHouse query failed (${executionTime}ms): ${error.message}`);
    }
  };
}

/**
 * Helper function to test ClickHouse connection
 */
export async function testClickHouseConnection(
  serverUrl: string,
  options?: {
    database?: string;
    username?: string;
    password?: string;
  }
): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const chQuery = createClickHouseFunction();
    const result = await chQuery({
      query: "SELECT version()",
      serverUrl,
      database: options?.database,
      username: options?.username,
      password: options?.password,
    });

    return {
      connected: true,
      version: result.data?.[0]?.["version()"],
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
export function queryClickHouse(
  table: string,
  serverUrl: string,
  options?: {
    database?: string;
    username?: string;
    password?: string;
    where?: string;
    limit?: number;
    orderBy?: string;
  }
) {
  const where = options?.where ? `WHERE ${options.where}` : "";
  const orderBy = options?.orderBy ? `ORDER BY ${options.orderBy}` : "";
  const limit = options?.limit ? `LIMIT ${options.limit}` : "";

  const query = `SELECT * FROM ${table} ${where} ${orderBy} ${limit}`.trim();

  return createClickHouseFunction()({
    query,
    serverUrl,
    database: options?.database,
    username: options?.username,
    password: options?.password,
  });
}
