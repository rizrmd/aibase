/**
 * DuckDB Extension
 * Query CSV, Excel, Parquet, and JSON files using SQL
 */

// Type definitions
interface DuckDBOptions {
  query: string;
  format?: "json" | "csv" | "markdown" | "table";
  readonly?: boolean;
  database?: string;
}

interface DuckDBResult {
  data: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

interface DuckDBRawResult {
  output: string;
  executionTime: number;
}

/**
 * Context documentation for the DuckDB extension
 */
const context = () =>
  '' +
  '### DuckDB Extension' +
  '' +
  'Query CSV, Excel, Parquet, and JSON files using SQL without importing data.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### duckdb(options)' +
  'Execute DuckDB SQL query on data files.' +
  '`' + '`' + '`' + 'typescript' +
  'await duckdb({' +
  '  query: "SELECT * FROM \'data.csv\' LIMIT 10",' +
  '  format: "json",        // Optional: "json" (default), "csv", "markdown", "table"' +
  '  readonly: true,        // Optional: readonly mode (default: true)' +
  '  database: ":memory:"   // Optional: database file path (default: ":memory:")' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`query\\` (required): SQL query to execute' +
  '- \\`format\\` (optional): Output format - "json" (default), "csv", "markdown", "table"' +
  '- \\`readonly\\` (optional): Enable readonly mode (default: true)' +
  '- \\`database\\` (optional): Database file path (default: ":memory:" for in-memory)' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  data: Array<any>,       // Result rows' +
  '  rowCount: number,       // Number of rows returned' +
  '  executionTime: number   // Execution time in milliseconds' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Query CSV file:**' +
  '`' + '`' + '`' + 'typescript' +
  'const result = await duckdb({' +
  '  query: "SELECT * FROM \'sales.csv\' LIMIT 10"' +
  '});' +
  'return { count: result.rowCount, data: result.data };' +
  '`' + '`' + '`' +
  '' +
  '2. **Query Excel file (with range):**' +
  '`' + '`' + '`' + 'typescript' +
  'const excel = await duckdb({' +
  '  query: \\`SELECT * FROM read_xlsx(\'report.xlsx\',' +
  '    header=true,' +
  '    all_varchar=true,' +
  '    range=\'A1:Z1000\')' +
  '  WHERE revenue IS NOT NULL' +
  '  LIMIT 20\\`' +
  '});' +
  'return excel.data;' +
  '`' + '`' + '`' +
  '' +
  '3. **Aggregation query:**' +
  '`' + '`' + '`' + 'typescript' +
  'const summary = await duckdb({' +
  '  query: \\`SELECT' +
  '    category,' +
  '    SUM(CAST(amount AS DOUBLE)) as total' +
  '  FROM read_xlsx(\'sales.xlsx\', header=true, all_varchar=true, range=\'A1:F500\')' +
  '  GROUP BY category' +
  '  ORDER BY total DESC\\`' +
  '});' +
  'return summary.data;' +
  '`' + '`' + '`' +
  '' +
  '4. **Join multiple files:**' +
  '`' + '`' + '`' + 'typescript' +
  'const joined = await duckdb({' +
  '  query: \\`' +
  '    SELECT u.name, s.score' +
  '    FROM \'users.csv\' u' +
  '    JOIN \'scores.parquet\' s' +
  '    ON u.id = s.user_id' +
  '    LIMIT 10' +
  '  \\`' +
  '});' +
  'return joined.data;' +
  '`' + '`' + '`' +
  '' +
  '5. **Query Parquet files:**' +
  '`' + '`' + '`' + 'typescript' +
  'const data = await duckdb({' +
  '  query: "SELECT * FROM \'data.parquet\' WHERE date > \'2024-01-01\'"' +
  '});' +
  'return data.data;' +
  '`' + '`' + '`' +
  '' +
  '6. **Query JSON files:**' +
  '`' + '`' + '`' + 'typescript' +
  'const json = await duckdb({' +
  '  query: "SELECT * FROM \'data.json\' WHERE status = \'active\'"' +
  '});' +
  'return json.data;' +
  '`' + '`' + '`' +
  '' +
  '**File Formats Supported:**' +
  '- CSV: \\`\'file.csv\'\\` or \\`read_csv_auto(\'file.csv\')\\`' +
  '- Excel: \\`read_xlsx(\'file.xlsx\', header=true, all_varchar=true, range=\'A1:Z1000\')\\`' +
  '- Parquet: \\`\'file.parquet\'\\`' +
  '- JSON: \\`\'file.json\'\\` or \\`read_json_auto(\'file.json\')\\`' +
  '' +
  '**Important Notes:**' +
  '- DuckDB queries files directly without loading into memory' +
  '- Use \\`all_variar=true\\` for Excel to prevent type inference issues' +
  '- Specify \\`range\\` for Excel files to define the data area' +
  '- Use \\`CAST(column AS DOUBLE)\\` when doing math on string columns' +
  '- In-memory database by default (\':memory:\')';

/**
 * DuckDB extension function
 */
const duckdbExtension = {
  /**
   * Query data files using DuckDB SQL
   */
  duckdb: async (options: DuckDBOptions): Promise<DuckDBResult | DuckDBRawResult> => {
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
        } catch (parseError: unknown) {
          // Return raw output for debugging
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(
            `Failed to parse JSON result: ${errorMessage}\nRaw output (first 500 chars): ${trimmedResult.substring(0, 500)}`
          );
        }
      } else {
        // Return raw output for non-JSON formats
        return {
          output: result.trim(),
          executionTime,
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`DuckDB query failed: ${errorMessage}`);
    }
  },
};

// @ts-expect-error - Extension loader wraps this code in an async function
return duckdbExtension;
