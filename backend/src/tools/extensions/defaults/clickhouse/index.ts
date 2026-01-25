/**
 * ClickHouse Extension
 * Query ClickHouse columnar databases for fast analytics
 */

/**
 * Context documentation for the ClickHouse extension
 */
export const context = () => `
### ClickHouse Extension

Query ClickHouse columnar databases for high-performance analytics.

**Available Functions:**

#### clickhouse(options)
Execute a ClickHouse query and return results.
\`\`\`typescript
await clickhouse({
  query: "SELECT * FROM events LIMIT 10",
  serverUrl: "http://localhost:8123",
  database: "default",        // Optional database name
  username: "default",         // Optional username
  password: "",                // Optional password
  format: "json",              // Optional: "json" (default), "csv", "tsv", "raw"
  timeout: 30000,              // Optional: timeout in milliseconds
  params: {                    // Optional query parameters
    param_name: "value"
  }
});
\`\`\`

#### testConnection(serverUrl, options)
Test connection to ClickHouse server.
\`\`\`typescript
await clickhouseExtension.testConnection("http://localhost:8123", {
  database: "mydb",
  username: "user"
});
\`\`\`

**Parameters:**
- \`query\` (required): SQL query to execute
- \`serverUrl\` (required): ClickHouse HTTP server URL (e.g., http://localhost:8123)
- \`database\` (optional): Database name (default: uses server default)
- \`username\` (optional): Authentication username
- \`password\` (optional): Authentication password
- \`format\` (optional): "json" (default), "csv", "tsv", or "raw"
- \`timeout\` (optional): Query timeout in milliseconds (default: 30000)
- \`params\` (optional): Query parameters to pass to ClickHouse

**Returns:**
\`\`\`typescript
{
  data: Array<any>,       // Result rows
  rowCount: number,       // Number of rows returned
  executionTime: number,  // Execution time in milliseconds
  query: string,          // The executed query
  stats: {                // Optional server statistics
    rows_read: number,
    bytes_read: number,
    elapsed: number
  }
}
\`\`\`

**Examples:**

1. **Simple query:**
\`\`\`typescript
const events = await clickhouse({
  query: "SELECT * FROM events LIMIT 100",
  serverUrl: "http://localhost:8123"
});
return { count: events.rowCount, data: events.data };
\`\`\`

2. **Using memory for secure credentials:**
\`\`\`typescript
await memory({
  action: 'set',
  category: 'database',
  key: 'clickhouse_url',
  value: 'http://localhost:8123'
});

const result = await clickhouse({
  query: \`SELECT
    event_type,
    count() as count
  FROM events
  GROUP BY event_type
  ORDER BY count DESC
  LIMIT 10\`,
  serverUrl: memory.read('database', 'clickhouse_url'),
  database: 'analytics'
});
return result.data;
\`\`\`

3. **With query parameters:**
\`\`\`typescript
const result = await clickhouse({
  query: "SELECT * FROM events WHERE date >= {date_param:Date}",
  serverUrl: memory.read('database', 'clickhouse_url'),
  params: {
    date_param: '2024-01-01'
  }
});
return result.data;
\`\`\`

4. **Export to CSV:**
\`\`\`typescript
const csv = await clickhouse({
  query: "SELECT * FROM large_table",
  serverUrl: memory.read('database', 'clickhouse_url'),
  format: "csv"
});
return { csv: csv.raw, rows: csv.rowCount };
\`\`\`

**Important Notes:**
- ClickHouse is optimized for analytics and large-scale data processing
- Use the \`format\` parameter to export data in different formats
- Query parameters are sent via HTTP for security and performance
- Connection errors include helpful diagnostic information
`;

/**
 * ClickHouse extension
 */
const clickhouseExtension = {
  /**
   * Query ClickHouse database
   *
   * Usage:
   * const result = await clickhouse({
   *   query: 'SELECT * FROM events LIMIT 10',
   *   serverUrl: memory.read('database', 'clickhouse_url')
   * });
   */
  clickhouse: async (options: {
    query: string;
    serverUrl: string;
    database?: string;
    username?: string;
    password?: string;
    format?: "json" | "raw" | "csv" | "tsv";
    timeout?: number;
    params?: Record<string, any>;
  }) {
    if (!options || typeof options !== "object") {
      throw new Error(
        "clickhouse requires an options object. Usage: await clickhouse({ query: 'SELECT * FROM table', serverUrl: '...' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "clickhouse requires 'query' parameter"
      );
    }

    if (!options.serverUrl) {
      throw new Error(
        "clickhouse requires 'serverUrl' parameter"
      );
    }

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      const cleanServerUrl = options.serverUrl.replace(/\/$/, "");
      const url = new URL(cleanServerUrl);

      if (options.database) {
        url.searchParams.set("database", options.database);
      }

      if (format === "json") {
        url.searchParams.set("default_format", "JSONEachRow");
      } else if (format === "csv") {
        url.searchParams.set("default_format", "CSV");
      } else if (format === "tsv") {
        url.searchParams.set("default_format", "TSV");
      }

      if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
          url.searchParams.set(`param_${key}`, String(value));
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
      };

      if (options.username || options.password) {
        const credentials = btoa(
          `${options.username || "default"}:${options.password || ""}`
        );
        headers["Authorization"] = `Basic ${credentials}`;
      }

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

        if (format === "json") {
          const text = await response.text();
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

          const extensionResult = {
            data: dataArray,
            rowCount: dataArray.length,
            executionTime,
            query: options.query,
            stats: Object.keys(stats).length > 0 ? stats : undefined,
          };

          // Broadcast inspection data if __broadcastInspection is available
          if (globalThis.__broadcastInspection) {
            globalThis.__broadcastInspection('clickhouse', {
              query: options.query,
              executionTime,
              rowCount: dataArray.length,
              columns: dataArray.length > 0 ? Object.keys(dataArray[0]) : [],
              sampleData: dataArray.slice(0, 3), // First 3 rows
              serverUrl: options.serverUrl,
              database: options.database,
              stats,
            });
          }

          return extensionResult;
        } else {
          const raw = await response.text();
          return {
            raw,
            rowCount: raw.split("\n").filter((line) => line.trim()).length,
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

      if (error.message?.includes("fetch failed") || error.message?.includes("ECONNREFUSED")) {
        throw new Error(
          `ClickHouse connection failed: Unable to connect to server at ${options.serverUrl}. ${error.message}`
        );
      }

      throw new Error(`ClickHouse query failed (${executionTime}ms): ${error.message}`);
    }
  },

  /**
   * Test ClickHouse connection
   */
  testConnection: async (serverUrl: string, options?: {
    database?: string;
    username?: string;
    password?: string;
  }): Promise<{ connected: boolean; version?: string; error?: string }> {
    try {
      const result = await clickhouseExtension.clickhouse({
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
  },
};

export default clickhouseExtension;
