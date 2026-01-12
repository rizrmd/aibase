/**
 * Context documentation for Trino functionality
 */
export const context = async () => {
  return `### TRINO QUERIES

Use trino() for Trino distributed queries.

**IMPORTANT:** Use trino() for Trino distributed queries!

**Available:** trino({ query, serverUrl, catalog?, schema?, username?, password?, format?, timeout? })

**SECURITY:** Store credentials in memory and use \`memory.read()\` function!

#### EXAMPLES

\`\`\`typescript
// RECOMMENDED: Store credentials in memory first (do this once):
await memory({ action: 'set', category: 'database', key: 'trino_url', value: 'http://localhost:8080' });
await memory({ action: 'set', category: 'database', key: 'trino_catalog', value: 'hive' });
await memory({ action: 'set', category: 'database', key: 'trino_schema', value: 'default' });
await memory({ action: 'set', category: 'database', key: 'trino_username', value: 'trino' });

// Then use memory.read() to get credentials (CLEAR and type-safe):
progress('Querying Trino...');
const result = await trino({
  query: 'SELECT region, COUNT(*) as count, SUM(revenue) as total_revenue FROM sales WHERE year = 2024 GROUP BY region ORDER BY total_revenue DESC',
  serverUrl: memory.read('database', 'trino_url'),      // Function call - type-safe!
  catalog: memory.read('database', 'trino_catalog'),    // Function call - type-safe!
  schema: memory.read('database', 'trino_schema'),      // Function call - type-safe!
  username: memory.read('database', 'trino_username')   // Function call - type-safe!
});
progress(\`Found \${result.rowCount} regions\`);
return { count: result.rowCount, regions: result.data, stats: result.stats };

// Cross-catalog query (using memory.read())
progress('Running cross-catalog query...');
const cross = await trino({
  query: 'SELECT h.customer_id, h.order_count, p.customer_name FROM hive.sales.order_summary h JOIN postgresql.crm.customers p ON h.customer_id = p.id WHERE h.order_count > 10',
  serverUrl: memory.read('database', 'trino_url')
});
return { customers: cross.rowCount, data: cross.data };

// Query with timeout (using memory.read())
progress('Connecting to Trino...');
const secured = await trino({
  query: "SELECT date_trunc('day', order_date) as day, COUNT(*) as orders FROM orders WHERE order_date >= CURRENT_DATE - INTERVAL '30' DAY GROUP BY 1 ORDER BY 1",
  serverUrl: memory.read('database', 'trino_url'),
  timeout: 60000
});
return { days: secured.rowCount, orderTrend: secured.data };
\`\`\``
};

/**
 * Trino query options
 */
export interface TrinoOptions {
  /** SQL query to execute */
  query: string;
  /** Trino server URL (use memory.read('database', 'trino_url') for secure credentials) */
  serverUrl: string;
  /** Trino catalog to query (use memory.read('database', 'trino_catalog') for secure credentials) */
  catalog?: string;
  /** Trino schema to query (use memory.read('database', 'trino_schema') for secure credentials) */
  schema?: string;
  /** Username for authentication (use memory.read('database', 'trino_username') for secure credentials) */
  username?: string;
  /** Password for authentication (use memory.read('database', 'trino_password') for secure credentials) */
  password?: string;
  /** Return format: 'json' (default), 'raw' */
  format?: "json" | "raw";
  /** Query timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Trino query result
 */
export interface TrinoResult {
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
  /** Query statistics */
  stats?: {
    state?: string;
    scheduled?: boolean;
    nodes?: number;
    totalSplits?: number;
    queuedSplits?: number;
    runningSplits?: number;
    completedSplits?: number;
  };
}

/**
 * Create a Trino query function for distributed SQL queries
 *
 * Uses Trino's REST API for distributed SQL queries.
 *
 * Credentials should be stored in memory and accessed via memory.read():
 * await memory({ action: 'set', category: 'database', key: 'trino_url', value: 'http://...' });
 * await memory({ action: 'set', category: 'database', key: 'trino_catalog', value: 'hive' });
 * await memory({ action: 'set', category: 'database', key: 'trino_schema', value: 'default' });
 * await memory({ action: 'set', category: 'database', key: 'trino_username', value: 'trino' });
 * await memory({ action: 'set', category: 'database', key: 'trino_password', value: 'secret' });
 *
 * Usage in script tool:
 *
 * // RECOMMENDED: Query using memory.read() for credentials:
 * const results = await trino({
 *   query: 'SELECT * FROM customers LIMIT 10',
 *   serverUrl: memory.read('database', 'trino_url'),
 *   catalog: memory.read('database', 'trino_catalog')
 * });
 * console.log(`Found ${results.rowCount} rows`);
 * console.log(results.data);
 *
 * // Query with aggregation:
 * const stats = await trino({
 *   query: 'SELECT region, COUNT(*) as count FROM orders GROUP BY region',
 *   serverUrl: memory.read('database', 'trino_url')
 * });
 */
export function createTrinoFunction() {
  return async (options: TrinoOptions): Promise<TrinoResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "trino requires an options object. Usage: trino({ query: 'SELECT * FROM table', serverUrl: memory.read('database', 'trino_url') })"
      );
    }

    if (!options.query) {
      throw new Error(
        "trino requires 'query' parameter. Usage: trino({ query: 'SELECT * FROM table', serverUrl: memory.read('database', 'trino_url') })"
      );
    }

    if (!options.serverUrl) {
      throw new Error(
        "trino requires 'serverUrl' parameter. " +
        "Use memory.read(): serverUrl: memory.read('database', 'trino_url') or direct URL: 'http://localhost:8080'"
      );
    }

    const serverUrl = options.serverUrl;
    const catalog = options.catalog;
    const schema = options.schema;
    const username = options.username;
    const password = options.password;

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      const cleanServerUrl = serverUrl.replace(/\/$/, ""); // Remove trailing slash
      const endpoint = `${cleanServerUrl}/v1/statement`;

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
        "X-Trino-User": username || "trino",
      };

      if (catalog) {
        headers["X-Trino-Catalog"] = catalog;
      }

      if (schema) {
        headers["X-Trino-Schema"] = schema;
      }

      // Add basic auth if password is provided
      if (password) {
        const credentials = btoa(`${username || "trino"}:${password}`);
        headers["Authorization"] = `Basic ${credentials}`;
      }

      // Execute query with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Initial query submission
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: options.query,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Trino query failed with status ${response.status}: ${errorText}`
          );
        }

        let result = await response.json();

        // Poll for results
        while (result.nextUri) {
          const pollTimeout = setTimeout(() => controller.abort(), timeout);

          const nextResponse = await fetch(result.nextUri, {
            method: "GET",
            headers: {
              "X-Trino-User": username || "trino",
            },
            signal: controller.signal,
          });

          clearTimeout(pollTimeout);

          if (!nextResponse.ok) {
            const errorText = await nextResponse.text();
            throw new Error(
              `Trino polling failed with status ${nextResponse.status}: ${errorText}`
            );
          }

          result = await nextResponse.json();

          // Check for errors in result
          if (result.error) {
            throw new Error(
              `Trino query error: ${result.error.message || JSON.stringify(result.error)}`
            );
          }

          // Break if we have data or query is complete
          if (result.data || (result.stats?.state === "FINISHED" && !result.nextUri)) {
            break;
          }
        }

        const executionTime = Date.now() - startTime;

        // Return results based on format
        if (format === "json") {
          const dataArray: any[] = [];

          // Process data if available
          if (result.data) {
            const columns = result.columns || [];
            const columnNames = columns.map((col: any) => col.name);

            // Convert rows to objects
            for (const row of result.data) {
              const obj: any = {};
              columnNames.forEach((name: string, index: number) => {
                obj[name] = row[index];
              });
              dataArray.push(obj);
            }
          }

          return {
            data: dataArray,
            rowCount: dataArray.length,
            executionTime,
            query: options.query,
            stats: result.stats
              ? {
                  state: result.stats.state,
                  scheduled: result.stats.scheduled,
                  nodes: result.stats.nodes,
                  totalSplits: result.stats.totalSplits,
                  queuedSplits: result.stats.queuedSplits,
                  runningSplits: result.stats.runningSplits,
                  completedSplits: result.stats.completedSplits,
                }
              : undefined,
          };
        } else {
          // Return raw result
          return {
            raw: result,
            rowCount: result.data ? result.data.length : undefined,
            executionTime,
            query: options.query,
            stats: result.stats,
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
          `Trino connection failed: Unable to connect to server at ${serverUrl}. Check your server URL and ensure Trino is running. ${error.message}`
        );
      }

      if (error.message?.includes("401") || error.message?.includes("403")) {
        throw new Error(
          `Trino authentication failed: Invalid credentials. ${error.message}`
        );
      }

      if (error.message?.includes("does not exist")) {
        throw new Error(
          `Trino query error: ${error.message}. Check that catalog/schema/tables exist.`
        );
      }

      if (error.message?.includes("syntax error") || error.message?.includes("mismatched input")) {
        throw new Error(
          `Trino syntax error: ${error.message}. Check your SQL query syntax.`
        );
      }

      throw new Error(`Trino query failed (${executionTime}ms): ${error.message}`);
    }
  };
}

/**
 * Helper function to test Trino connection
 */
export async function testTrinoConnection(
  serverUrl: string,
  options?: {
    catalog?: string;
    schema?: string;
    username?: string;
    password?: string;
  }
): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const trinoQuery = createTrinoFunction();
    const result = await trinoQuery({
      query: "SELECT version()",
      serverUrl,
      catalog: options?.catalog,
      schema: options?.schema,
      username: options?.username,
      password: options?.password,
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
export function queryTrino(
  table: string,
  serverUrl: string,
  options?: {
    catalog?: string;
    schema?: string;
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

  return createTrinoFunction()({
    query,
    serverUrl,
    catalog: options?.catalog,
    schema: options?.schema,
    username: options?.username,
    password: options?.password,
  });
}
