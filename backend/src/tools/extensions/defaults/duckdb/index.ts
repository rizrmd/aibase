/**
 * DuckDB Extension
 * Query CSV, Excel, Parquet, and JSON files using SQL
 */

/**
 * DuckDB extension function
 */
const duckdbExtension = {
  /**
   * Query data files using DuckDB SQL
   */
  duckdb: async (options) => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "duckdb requires an options object. Usage: await duckdb({ query: 'SELECT * FROM data.csv' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "duckdb requires 'query' parameter. Usage: await duckdb({ query: 'SELECT * FROM data.csv' })"
      );
    }

    const format = options.format || "json";
    const readonly = options.readonly !== false;
    const startTime = Date.now();

    try {
      // Import $ dynamically
      const { $ } = await import('bun');

      // Build DuckDB command
      let command;

      if (options.database) {
        command = [
          "duckdb",
          readonly ? "-readonly" : "",
          options.database,
        ].filter(Boolean);
      } else {
        command = ["duckdb", ":memory:"];
      }

      // DuckDB CLI flags based on format
      const formatFlags = {
        json: "-json",
        csv: "-csv",
        markdown: "-markdown",
        table: "-table",
      };

      const formatFlag = formatFlags[format] || "-json";

      // Execute DuckDB query using Bun.$
      const finalQuery = options.query.trim();
      const result = await $`${command} ${formatFlag} -c ${finalQuery}`.text();

      const executionTime = Date.now() - startTime;

      // Parse result based on format
      if (format === "json") {
        const trimmedResult = result.trim();

        // Handle empty result
        if (!trimmedResult) {
          return {
            data: [],
            rowCount: 0,
            executionTime,
          };
        }

        try {
          // DuckDB -json outputs a JSON array
          const data = JSON.parse(trimmedResult);
          const dataArray = Array.isArray(data) ? data : [data];

          const extensionResult = {
            data: dataArray,
            rowCount: dataArray.length,
            executionTime,
          };

          // Broadcast inspection data if available
          if (globalThis.__broadcastInspection) {
            globalThis.__broadcastInspection('duckdb', {
              ...extensionResult,
            });
          }

          return extensionResult;
        } catch (parseError) {
          // Return raw output for debugging
          throw new Error(
            `Failed to parse JSON result: ${parseError.message}\nRaw output (first 500 chars): ${trimmedResult.substring(0, 500)}`
          );
        }
      } else {
        // Return raw output for non-JSON formats
        return {
          output: result.trim(),
          executionTime,
        };
      }
    } catch (error) {
      throw new Error(`DuckDB query failed: ${error.message}`);
    }
  },
};

return duckdbExtension;
