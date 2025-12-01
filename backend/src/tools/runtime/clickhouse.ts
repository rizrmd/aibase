/**
 * ClickHouse query options
 */
export interface ClickHouseOptions {
  /** SQL query to execute */
  query: string;
  /** ClickHouse server URL (e.g., 'http://localhost:8123') */
  serverUrl: string;
  /** Database to query */
  database?: string;
  /** Username for authentication */
  username?: string;
  /** Password for authentication */
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
 * Create a ClickHouse query function using HTTP interface
 *
 * Uses ClickHouse's HTTP interface for fast columnar database queries.
 *
 * Usage in script tool:
 *
 * // Query the database:
 * const results = await clickhouse({
 *   query: 'SELECT * FROM users WHERE active = 1 LIMIT 10',
 *   serverUrl: 'http://localhost:8123',
 *   database: 'default',
 *   username: 'default',
 *   password: ''
 * });
 * console.log(`Found ${results.rowCount} users`);
 * console.log(results.data);
 *
 * // Query with aggregation:
 * const stats = await clickhouse({
 *   query: 'SELECT status, COUNT(*) as count FROM orders GROUP BY status',
 *   serverUrl: 'http://localhost:8123',
 *   database: 'default'
 * });
 *
 * // Query with parameters:
 * const filtered = await clickhouse({
 *   query: 'SELECT * FROM users WHERE age > {age:UInt8} LIMIT 10',
 *   serverUrl: 'http://localhost:8123',
 *   database: 'default',
 *   params: { age: 25 }
 * });
 *
 * // Query with custom timeout:
 * const large = await clickhouse({
 *   query: 'SELECT * FROM large_table',
 *   serverUrl: 'http://localhost:8123',
 *   database: 'default',
 *   timeout: 60000 // 60 seconds
 * });
 */
export function createClickHouseFunction() {
  return async (options: ClickHouseOptions): Promise<ClickHouseResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "clickhouse requires an options object. Usage: clickhouse({ query: 'SELECT * FROM table', serverUrl: 'http://localhost:8123', database: 'default' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "clickhouse requires 'query' parameter. Usage: clickhouse({ query: 'SELECT * FROM table', serverUrl: 'http://localhost:8123' })"
      );
    }

    if (!options.serverUrl) {
      throw new Error(
        "clickhouse requires 'serverUrl' parameter. Usage: clickhouse({ query: '...', serverUrl: 'http://localhost:8123' })"
      );
    }

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      const serverUrl = options.serverUrl.replace(/\/$/, ""); // Remove trailing slash

      // Build URL with query parameters
      const url = new URL(serverUrl);

      // Set database if provided
      if (options.database) {
        url.searchParams.set("database", options.database);
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
      if (options.username || options.password) {
        const credentials = btoa(
          `${options.username || "default"}:${options.password || ""}`
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
          `ClickHouse connection failed: Unable to connect to server at ${options.serverUrl}. Check your server URL and ensure ClickHouse is running. ${error.message}`
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
