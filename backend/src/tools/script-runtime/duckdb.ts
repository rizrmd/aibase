import { $ } from "bun";

/**
 * Context documentation for DuckDB functionality
 */
export const context = async () => {
  return `### DUCKDB SQL QUERIES

Use duckdb() for querying CSV, Excel, Parquet, and JSON files using SQL.

**Available:** duckdb({ query, database?, format?, readonly? })

#### EXAMPLES

**CRITICAL: FILE PATHS ARE RELATIVE!**
- The script automatically executes in the files directory.
- DO NOT use full paths causing "No such file or directory" errors.
- CORRECT: \`read_xlsx('data.xlsx')\`
- WRONG: \`read_xlsx('data/proj_123/conv_456/files/data.xlsx')\`
- CROSS-CONVERSATION: \`../../<other_conv_id>/files/data.xlsx\`

\`\`\`typescript
// Query CSV file
progress('Querying sales data...');
const result = await duckdb({
  query: "SELECT category, SUM(amount) as total FROM 'sales.csv' GROUP BY category ORDER BY total DESC"
});
return { categories: result.rowCount, data: result.data };

// Join multiple files
progress('Joining data files...');
const joined = await duckdb({
  query: "SELECT c.name, c.email, COUNT(o.id) as orders FROM 'customers.csv' c LEFT JOIN 'orders.parquet' o ON c.id = o.customer_id GROUP BY c.id, c.name, c.email HAVING orders > 5"
});
return { customers: joined.rowCount, topCustomers: joined.data.slice(0, 10) };

// Read Excel file (range required for multi-column files!)
progress('Reading Excel file...');
const excel = await duckdb({
  query: "SELECT * FROM read_xlsx('report.xlsx', sheet='Sales', header=true, all_varchar=true, range='A1:Z1000') WHERE revenue IS NOT NULL LIMIT 20"
});
return { rows: excel.rowCount, topSales: excel.data };

// Excel with aggregation (cast to numeric when needed)
progress('Analyzing Excel data...');
const summary = await duckdb({
  query: "SELECT category, COUNT(*) as count, AVG(CAST(amount AS DOUBLE)) as avg_amount, SUM(CAST(amount AS DOUBLE)) as total FROM read_xlsx('data.xlsx', header=true, all_varchar=true, range='A1:F1000') WHERE category IS NOT NULL GROUP BY category ORDER BY total DESC"
});
return { categories: summary.rowCount, breakdown: summary.data };
\`\`\``
};

/**
 * DuckDB query options
 */
export interface DuckDBOptions {
  /** SQL query to execute */
  query: string;
  /** Optional database file path (uses in-memory DB if not provided) */
  database?: string;
  /** Return format: 'json' (default), 'csv', 'markdown', 'table' */
  format?: "json" | "csv" | "markdown" | "table";
  /** Read-only mode (default: true) */
  readonly?: boolean;
}

/**
 * DuckDB query result
 */
export interface DuckDBResult {
  /** Query results as array of objects (when format is 'json') */
  data?: any[];
  /** Raw output (when format is not 'json') */
  output?: string;
  /** Number of rows returned */
  rowCount?: number;
  /** Execution time in milliseconds */
  executionTime?: number;
}

/**
 * Create a DuckDB query function that executes queries using the DuckDB CLI
 *
 * Supports reading various file formats directly in SQL queries:
 * - CSV: SELECT * FROM 'file.csv'
 * - Parquet: SELECT * FROM 'file.parquet'
 * - JSON: SELECT * FROM 'file.json'
 * - Excel: SELECT * FROM read_xlsx('file.xlsx', header=true, all_varchar=true, range='A1:Z1000')
 *
 * IMPORTANT for Excel files:
 * - The 'range' parameter is REQUIRED for multi-column Excel files!
 *   Without it, only the first column will be read.
 * - Use 'all_varchar=true' to read all cells as text and avoid type conversion errors
 * - Cast to numeric types when needed: CAST(column AS DOUBLE) or CAST(column AS INTEGER)
 *
 * Excel extension auto-loads on first use. Named parameters for read_xlsx:
 * - range: REQUIRED for multi-column data (e.g., 'A1:Z1000')
 * - header: treat first row as column names (default: auto-inferred)
 * - all_varchar: read all cells as text (recommended: true)
 * - sheet: specify sheet name (default: first sheet)
 * - stop_at_empty: stop at first empty row
 *
 * @param cwd - Working directory for the DuckDB process (defaults to current directory)
 */
export function createDuckDBFunction(cwd?: string) {
  return async (options: DuckDBOptions): Promise<DuckDBResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "duckdb requires an options object. Usage: duckdb({ query: 'SELECT * FROM data.csv' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "duckdb requires 'query' parameter. Usage: duckdb({ query: 'SELECT * FROM data.csv' })"
      );
    }

    const format = options.format || "json";
    const readonly = options.readonly !== false; // Default to true
    const startTime = Date.now();

    try {
      // Build DuckDB command
      let command: string[];

      if (options.database) {
        // Use database file
        command = [
          "duckdb",
          readonly ? "-readonly" : "",
          options.database,
        ].filter(Boolean);
      } else {
        // Use in-memory database
        command = ["duckdb", ":memory:"];
      }

      // Add output format modifier to the query
      let finalQuery = options.query.trim();

      // DuckDB CLI flags based on format
      const formatFlags: Record<string, string> = {
        json: "-json",
        csv: "-csv",
        markdown: "-markdown",
        table: "-table",
      };

      const formatFlag = formatFlags[format] || "-json";

      // Execute DuckDB query using Bun.$ with optional cwd
      let proc = $`${command} ${formatFlag} -c ${finalQuery}`;

      if (cwd) {
        proc = proc.cwd(cwd);
      }

      const result = await proc.text();

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
          // DuckDB -json outputs a JSON array: [{...}, {...}, ...]
          const data = JSON.parse(trimmedResult);

          // Ensure it's an array
          const dataArray = Array.isArray(data) ? data : [data];

          return {
            data: dataArray,
            rowCount: dataArray.length,
            executionTime,
          };
        } catch (parseError: any) {
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
    } catch (error: any) {
      // Improve error messages
      if (error.stderr) {
        throw new Error(`DuckDB error: ${error.stderr.toString()}`);
      }
      throw new Error(`DuckDB query failed: ${error.message}`);
    }
  };
}

/**
 * Helper function to read CSV files
 */
export function readCSV(
  filePath: string,
  options?: { limit?: number; cwd?: string }
) {
  const limit = options?.limit ? `LIMIT ${options.limit}` : "";
  return createDuckDBFunction(options?.cwd)({
    query: `SELECT * FROM '${filePath}' ${limit}`,
    format: "json",
  });
}

/**
 * Helper function to read Excel files
 * Uses DuckDB's excel extension which auto-loads on first use
 *
 * IMPORTANT: For multi-column Excel files, you MUST specify the range parameter!
 * Example: readExcel('file.xlsx', { range: 'A1:Z1000' })
 */
export function readExcel(
  filePath: string,
  options?: {
    sheet?: string;
    header?: boolean;
    range?: string;
    limit?: number;
    cwd?: string;
  }
) {
  const limit = options?.limit ? `LIMIT ${options.limit}` : "";

  // Build read_xlsx parameters - always use all_varchar to avoid type errors
  const params: string[] = ["all_varchar=true"];

  if (options?.sheet) {
    params.push(`sheet='${options.sheet}'`);
  }
  if (options?.header !== undefined) {
    params.push(`header=${options.header}`);
  }
  if (options?.range) {
    params.push(`range='${options.range}'`);
  } else {
    // Warn about missing range - default to reading a large range
    params.push(`range='A1:ZZ10000'`);
  }

  const paramsStr = `, ${params.join(', ')}`;

  // Excel extension auto-loads, no need to install/load
  const query = `SELECT * FROM read_xlsx('${filePath}'${paramsStr}) ${limit}`;

  return createDuckDBFunction(options?.cwd)({
    query,
    format: "json",
  });
}
