/**
 * Trino Extension
 * Execute distributed SQL queries via Trino
 */

// Type definitions
interface TrinoOptions {
  query: string;
  serverUrl: string;
  catalog?: string;
  schema?: string;
  username?: string;
  password?: string;
  format?: "json" | "raw";
  timeout?: number;
}

interface TrinoColumn {
  name: string;
  type?: string;
}

interface TrinoStats {
  state?: string;
  scheduled?: boolean;
  nodes?: number;
  totalSplits?: number;
  queuedSplits?: number;
  runningSplits?: number;
  completedSplits?: number;
}

interface TrinoAPIResponse {
  data?: unknown[][];
  columns?: TrinoColumn[];
  nextUri?: string;
  error?: {
    message?: string;
    [key: string]: unknown;
  };
  stats?: TrinoStats;
  id?: string;
  infoUri?: string;
}

interface TrinoResult {
  data: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  query: string;
  stats?: TrinoStats;
}

interface TrinoRawResult {
  raw: TrinoAPIResponse;
  rowCount?: number;
  executionTime: number;
  query: string;
  stats?: TrinoStats;
}

interface TrinoJSONResult extends TrinoResult {}


interface TestConnectionOptions {
  catalog?: string;
  schema?: string;
  username?: string;
  password?: string;
}

interface TestConnectionResult {
  connected: boolean;
  version?: string;
  error?: string;
}

/**
 * Context documentation for the Trino extension
 */
const context = () =>
  '' +
  '### Trino Extension' +
  '' +
  'Execute distributed SQL queries across multiple data sources using Trino.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### trino(options)' +
  'Execute a Trino distributed SQL query.' +
  '`' + '`' + '`' + 'typescript' +
  'await trino({' +
  '  query: "SELECT * FROM customers LIMIT 10",' +
  '  serverUrl: "http://localhost:8080",' +
  '  catalog: "hive",          // Optional: catalog name' +
  '  schema: "default",         // Optional: schema name' +
  '  username: "trino",         // Optional: username' +
  '  password: "",              // Optional: password' +
  '  format: "json",            // Optional: "json" (default) or "raw"' +
  '  timeout: 30000             // Optional: timeout in milliseconds' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`query\\` (required): SQL query to execute' +
  '- \\`serverUrl\\` (required): Trino server URL (e.g., http://localhost:8080)' +
  '- \\`catalog\\` (optional): Catalog name to query' +
  '- \\`schema\\` (optional): Schema name to query' +
  '- \\`username\\` (optional): Authentication username (default: "trino")' +
  '- \\`password\\` (optional): Authentication password' +
  '- \\`format\\` (optional): "json" (default) or "raw"' +
  '- \\`timeout\\` (optional): Query timeout in milliseconds (default: 30000)' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  data: Array<any>,       // Result rows' +
  '  rowCount: number,       // Number of rows returned' +
  '  executionTime: number,  // Execution time in milliseconds' +
  '  query: string          // The executed query' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Simple distributed query:**' +
  '`' + '`' + '`' + 'typescript' +
  'const customers = await trino({' +
  '  query: "SELECT * FROM customers LIMIT 10",' +
  '  serverUrl: "http://localhost:8080",' +
  '  catalog: "hive",' +
  '  schema: "sales"' +
  '});' +
  'return { count: customers.rowCount, data: customers.data };' +
  '`' + '`' + '`' +
  '' +
  '2. **Using memory for secure credentials:**' +
  '`' + '`' + '`' + 'typescript' +
  'await memory({' +
  '  action: \'set\',' +
  '  category: \'database\',' +
  '  key: \'trino_url\',' +
  '  value: \'http://trino.example.com:8080\'' +
  '});' +
  '' +
  'const result = await trino({' +
  '  query: \\`SELECT' +
  '    customer_id,' +
  '    SUM(order_total) as total_spent' +
  '  FROM orders' +
  '  GROUP BY customer_id' +
  '  ORDER BY total_spent DESC' +
  '  LIMIT 10\\`,' +
  '  serverUrl: memory.read(\'database\', \'trino_url\'),' +
  '  catalog: \'hive\'' +
  '});' +
  'return result.data;' +
  '`' + '`' + '`' +
  '' +
  '3. **Cross-catalog query:**' +
  '`' + '`' + '`' + 'typescript' +
  'const crossCatalog = await trino({' +
  '  query: \\`' +
  '    SELECT' +
  '      h.customer_id,' +
  '      m.customer_name,' +
  '      SUM(h.order_amount) as total' +
  '    FROM hive.orders h' +
  '    JOIN mysql.customers m ON h.customer_id = m.id' +
  '    GROUP BY h.customer_id, m.customer_name' +
  '    LIMIT 10' +
  '  \\`,' +
  '  serverUrl: memory.read(\'database\', \'trino_url\')' +
  '});' +
  'return crossCatalog.data;' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Trino enables distributed queries across multiple data sources' +
  '- Supports querying across different catalogs (Hive, MySQL, PostgreSQL, etc.)' +
  '- Automatically polls for results on large queries' +
  '- Connection errors include helpful diagnostic information' +
  '- Perfect for federated analytics across data systems';

/**
 * Trino extension
 */
const trinoExtension = {
  /**
   * Query Trino database
   *
   * Usage:
   * const result = await trino({
   *   query: 'SELECT * FROM customers LIMIT 10',
   *   serverUrl: memory.read('database', 'trino_url')
   * });
   */
  trino: async (options: TrinoOptions): Promise<TrinoResult | TrinoRawResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "trino requires an options object. Usage: await trino({ query: 'SELECT * FROM table', serverUrl: '...' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "trino requires 'query' parameter"
      );
    }

    if (!options.serverUrl) {
      throw new Error(
        "trino requires 'serverUrl' parameter"
      );
    }

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      const cleanServerUrl = options.serverUrl.replace(/\/$/, "");
      const endpoint = `${cleanServerUrl}/v1/statement`;

      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
        "X-Trino-User": options.username || "trino",
      };

      if (options.catalog) {
        headers["X-Trino-Catalog"] = options.catalog;
      }

      if (options.schema) {
        headers["X-Trino-Schema"] = options.schema;
      }

      if (options.password) {
        const credentials = btoa(`${options.username || "trino"}:${options.password}`);
        headers["Authorization"] = `Basic ${credentials}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
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

        let result = await response.json() as TrinoAPIResponse;

        while (result.nextUri) {
          const pollTimeout = setTimeout(() => controller.abort(), timeout);

          const nextResponse = await fetch(result.nextUri, {
            method: "GET",
            headers: {
              "X-Trino-User": options.username || "trino",
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

          result = await nextResponse.json() as TrinoAPIResponse;

          if (result.error) {
            throw new Error(
              `Trino query error: ${result.error.message || JSON.stringify(result.error)}`
            );
          }

          if (result.data || (result.stats?.state === "FINISHED" && !result.nextUri)) {
            break;
          }
        }

        const executionTime = Date.now() - startTime;

        if (format === "json") {
          const dataArray: Record<string, unknown>[] = [];

          if (result.data) {
            const columns = result.columns || [];
            const columnNames = columns.map((col: TrinoColumn) => col.name);

            for (const row of result.data) {
              const obj: Record<string, unknown> = {};
              columnNames.forEach((name: string, index: number) => {
                obj[name] = row[index];
              });
              dataArray.push(obj);
            }
          }

          const extensionResult = {
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

          // Broadcast inspection data if __broadcastInspection is available
          if (globalThis.__broadcastInspection) {
            globalThis.__broadcastInspection('trino', {
              query: options.query,
              executionTime,
              rowCount: dataArray.length,
              columns: dataArray.length > 0 ? Object.keys(dataArray[0] as Record<string, unknown>) : [],
              sampleData: dataArray.slice(0, 3), // First 3 rows
              serverUrl: options.serverUrl,
              catalog: options.catalog,
              schema: options.schema,
              stats: extensionResult.stats,
            });
          }

          return extensionResult;
        } else {
          return {
            raw: result,
            rowCount: result.data ? result.data.length : undefined,
            executionTime,
            query: options.query,
            stats: result.stats,
          };
        }
      } catch (error: unknown) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Query timeout after ${timeout}ms`);
        }

        throw error;
      }
    } catch (error: unknown) {
      const executionTime = Date.now() - startTime;

      if (error instanceof Error && (error.message?.includes("fetch failed") || error.message?.includes("ECONNREFUSED"))) {
        throw new Error(
          `Trino connection failed: Unable to connect to server at ${options.serverUrl}. ${error.message}`
        );
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Trino query failed (${executionTime}ms): ${errorMessage}`);
    }
  },

  /**
   * Test Trino connection
   */
  testConnection: async (serverUrl: string, options?: TestConnectionOptions): Promise<TestConnectionResult> => {
    try {
      const result = await trinoExtension.trino({
        query: "SELECT version()",
        serverUrl,
        catalog: options?.catalog,
        schema: options?.schema,
        username: options?.username,
        password: options?.password,
      });

      return {
        connected: true,
        version: ((result as TrinoJSONResult).data?.[0] as Record<string, unknown> | undefined)?.version as string | undefined,
      };
    } catch (error: unknown) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// @ts-expect-error - Extension loader wraps this code in an async function
return trinoExtension;
