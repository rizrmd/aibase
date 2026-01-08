import * as fs from "fs/promises";
import * as path from "path";

/**
 * Load memory from file to retrieve stored credentials
 */
async function loadMemory(projectId: string): Promise<Record<string, any>> {
  const memoryPath = path.join(
    process.cwd(),
    "data",
    projectId,
    "memory.json"
  );

  try {
    const content = await fs.readFile(memoryPath, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    // File doesn't exist or is invalid, return empty object
    return {};
  }
}

/**
 * Parse memory reference and retrieve value
 * Supports syntax: "memory:category.key" -> reads from memory[category][key]
 * Example: "memory:database.trino_url" -> memory.database.trino_url
 */
async function parseMemoryReference(value: string | undefined, projectId: string): Promise<string | undefined> {
  if (!value || !value.startsWith('memory:')) {
    return value;
  }

  const reference = value.substring(7); // Remove "memory:" prefix
  const parts = reference.split('.');

  if (parts.length !== 2) {
    throw new Error(
      `Invalid memory reference: "${value}". Expected format: "memory:category.key" (e.g., "memory:database.trino_url")`
    );
  }

  const [category, key] = parts;
  const memory = await loadMemory(projectId);

  if (!memory[category]) {
    throw new Error(
      `Memory category "${category}" not found. Store it first: await memory({ action: 'set', category: '${category}', key: '${key}', value: '...' })`
    );
  }

  if (!memory[category][key]) {
    throw new Error(
      `Memory key "${key}" not found in category "${category}". Store it first: await memory({ action: 'set', category: '${category}', key: '${key}', value: '...' })`
    );
  }

  return memory[category][key];
}

/**
 * Context documentation for Trino functionality
 */
export const context = async () => {
  return `### TRINO QUERIES

Use trino() for Trino distributed queries.

**IMPORTANT:** Use trino() for Trino distributed queries!

**Available:** trino({ query, serverUrl, catalog?, schema?, username?, password?, format?, timeout? })

**SECURITY:** Store credentials in memory and reference them explicitly!

#### EXAMPLES

\`\`\`typescript
// RECOMMENDED: Store credentials in memory first (do this once):
await memory({ action: 'set', category: 'database', key: 'trino_url', value: 'http://localhost:8080' });
await memory({ action: 'set', category: 'database', key: 'trino_catalog', value: 'hive' });
await memory({ action: 'set', category: 'database', key: 'trino_schema', value: 'default' });
await memory({ action: 'set', category: 'database', key: 'trino_username', value: 'trino' });

// Then reference credentials explicitly (CLEAR which credentials are used):
progress('Querying Trino...');
const result = await trino({
  query: 'SELECT region, COUNT(*) as count, SUM(revenue) as total_revenue FROM sales WHERE year = 2024 GROUP BY region ORDER BY total_revenue DESC',
  serverUrl: 'memory:database.trino_url',      // Explicit memory reference
  catalog: 'memory:database.trino_catalog',    // Explicit memory reference
  schema: 'memory:database.trino_schema',      // Explicit memory reference
  username: 'memory:database.trino_username'   // Explicit memory reference
});
progress(\`Found \${result.rowCount} regions\`);
return { count: result.rowCount, regions: result.data, stats: result.stats };

// Cross-catalog query (explicit memory references)
progress('Running cross-catalog query...');
const cross = await trino({
  query: 'SELECT h.customer_id, h.order_count, p.customer_name FROM hive.sales.order_summary h JOIN postgresql.crm.customers p ON h.customer_id = p.id WHERE h.order_count > 10',
  serverUrl: 'memory:database.trino_url'
});
return { customers: cross.rowCount, data: cross.data };

// Query with timeout (explicit memory references)
progress('Connecting to Trino...');
const secured = await trino({
  query: "SELECT date_trunc('day', order_date) as day, COUNT(*) as orders FROM orders WHERE order_date >= CURRENT_DATE - INTERVAL '30' DAY GROUP BY 1 ORDER BY 1",
  serverUrl: 'memory:database.trino_url',
  timeout: 60000
});
return { days: secured.rowCount, orderTrend: secured.data };

// ALTERNATIVE: Direct credentials (credentials visible in code)
const direct = await trino({
  query: 'SELECT * FROM items',
  serverUrl: 'http://localhost:8080',
  catalog: 'hive',
  schema: 'warehouse',
  username: 'user',
  password: 'secret'
});
\`\`\``
};

/**
 * Trino query options
 */
export interface TrinoOptions {
  /** SQL query to execute */
  query: string;
  /** Trino server URL or memory reference (e.g., "memory:database.trino_url") */
  serverUrl: string;
  /** Trino catalog to query or memory reference (e.g., "memory:database.trino_catalog") */
  catalog?: string;
  /** Trino schema to query or memory reference (e.g., "memory:database.trino_schema") */
  schema?: string;
  /** Username for authentication or memory reference (e.g., "memory:database.trino_username") */
  username?: string;
  /** Password for authentication or memory reference (e.g., "memory:database.trino_password") */
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
 * Create a Trino query function with memory support for secure credential storage
 *
 * Uses Trino's REST API for distributed SQL queries.
 *
 * Credentials can be stored securely in memory:
 * await memory({ action: 'set', category: 'database', key: 'trino_url', value: 'http://...' });
 * await memory({ action: 'set', category: 'database', key: 'trino_catalog', value: 'hive' });
 * await memory({ action: 'set', category: 'database', key: 'trino_schema', value: 'default' });
 * await memory({ action: 'set', category: 'database', key: 'trino_username', value: 'trino' });
 * await memory({ action: 'set', category: 'database', key: 'trino_password', value: 'secret' });
 *
 * Usage in script tool:
 *
 * // RECOMMENDED: Query using credentials from memory:
 * const results = await trino({
 *   query: 'SELECT * FROM customers LIMIT 10'
 * });
 * console.log(`Found ${results.rowCount} rows`);
 * console.log(results.data);
 *
 * // Query with aggregation:
 * const stats = await trino({
 *   query: 'SELECT region, COUNT(*) as count FROM orders GROUP BY region'
 * });
 *
 * @param projectId - Project ID for loading memory
 */
export function createTrinoFunction(projectId?: string) {
  return async (options: TrinoOptions): Promise<TrinoResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "trino requires an options object. Usage: trino({ query: 'SELECT * FROM table', serverUrl: 'memory:database.trino_url' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "trino requires 'query' parameter. Usage: trino({ query: 'SELECT * FROM table', serverUrl: 'memory:database.trino_url' })"
      );
    }

    if (!options.serverUrl) {
      throw new Error(
        "trino requires 'serverUrl' parameter. " +
        "Use memory reference: serverUrl: 'memory:database.trino_url' or direct URL: 'http://localhost:8080'"
      );
    }

    // Parse memory references if they're in the format "memory:category.key"
    const serverUrl = projectId
      ? await parseMemoryReference(options.serverUrl, projectId)
      : options.serverUrl;
    const catalog = projectId && options.catalog
      ? await parseMemoryReference(options.catalog, projectId)
      : options.catalog;
    const schema = projectId && options.schema
      ? await parseMemoryReference(options.schema, projectId)
      : options.schema;
    const username = projectId && options.username
      ? await parseMemoryReference(options.username, projectId)
      : options.username;
    const password = projectId && options.password !== undefined
      ? await parseMemoryReference(options.password, projectId)
      : options.password;

    if (!serverUrl) {
      throw new Error(
        "trino serverUrl resolved to undefined. Check your memory reference or provide a direct URL."
      );
    }

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      serverUrl = serverUrl!.replace(/\/$/, ""); // Remove trailing slash
      const endpoint = `${serverUrl}/v1/statement`;

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
    projectId?: string;
  }
): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const trinoQuery = createTrinoFunction(options?.projectId);
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
    projectId?: string;
  }
) {
  const where = options?.where ? `WHERE ${options.where}` : "";
  const orderBy = options?.orderBy ? `ORDER BY ${options.orderBy}` : "";
  const limit = options?.limit ? `LIMIT ${options.limit}` : "";

  const query = `SELECT * FROM ${table} ${where} ${orderBy} ${limit}`.trim();

  return createTrinoFunction(options?.projectId)({
    query,
    serverUrl,
    catalog: options?.catalog,
    schema: options?.schema,
    username: options?.username,
    password: options?.password,
  });
}
