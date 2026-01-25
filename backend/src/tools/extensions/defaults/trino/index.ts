/**
 * Trino Extension
 * Execute distributed SQL queries via Trino
 */

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
  trino: async (options: {
    query: string;
    serverUrl: string;
    catalog?: string;
    schema?: string;
    username?: string;
    password?: string;
    format?: "json" | "raw";
    timeout?: number;
  }) {
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

        let result = await response.json();

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

          result = await nextResponse.json();

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
          const dataArray: any[] = [];

          if (result.data) {
            const columns = result.columns || [];
            const columnNames = columns.map((col: any) => col.name);

            for (const row of result.data) {
              const obj: any = {};
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
              columns: dataArray.length > 0 ? Object.keys(dataArray[0]) : [],
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
          `Trino connection failed: Unable to connect to server at ${options.serverUrl}. ${error.message}`
        );
      }

      throw new Error(`Trino query failed (${executionTime}ms): ${error.message}`);
    }
  },

  /**
   * Test Trino connection
   */
  testConnection: async (serverUrl: string, options?: {
    catalog?: string;
    schema?: string;
    username?: string;
    password?: string;
  }): Promise<{ connected: boolean; version?: string; error?: string }> {
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
        version: result.data?.[0]?.version,
      };
    } catch (error: any) {
      return {
        connected: false,
        error: error.message,
      };
    }
  },
};

export default trinoExtension;
