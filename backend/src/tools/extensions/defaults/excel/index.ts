/**
 * Excel Document Extension
 * Extract and explore Excel spreadsheets using DuckDB
 * Also supports SQL queries on CSV, Parquet, and JSON files
 */

import * as fs from "fs/promises";
import * as path from "path";

// Type definition for injected utilities
interface ExtensionUtils {
  generateTitle: (options: {
    systemPrompt?: string;
    content: string;
    label?: string;
    timeoutMs?: number;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<string | undefined>;
}

declare const utils: ExtensionUtils;

// Dynamically import all dependencies to avoid esbuild transpilation issues
let documentExtractorModule: any = null;
async function isExcelFile(fileName: string): Promise<boolean> {
  if (!documentExtractorModule) {
    documentExtractorModule = await import(
      `${process.cwd()}/backend/src/utils/document-extractor.ts`
    );
  }
  return documentExtractorModule.isExcelFile(fileName);
}

let configPathsModule: any = null;
async function getProjectFilesDir(
  projectId: string,
  tenantId: string | number,
): Promise<string> {
  if (!configPathsModule) {
    configPathsModule = await import(
      `${process.cwd()}/backend/src/config/paths.ts`
    );
  }
  return configPathsModule.getProjectFilesDir(projectId, tenantId);
}

let getDuckDBPathFn: (() => Promise<string>) | null = null;
async function getDuckDBPath(): Promise<string> {
  if (!getDuckDBPathFn) {
    // Use absolute path from backend directory to avoid relative path resolution issues
    const module = await import(
      `${process.cwd()}/backend/src/binaries/duckdb.ts`
    );
    getDuckDBPathFn = module.getDuckDBPath;
  }
  if (!getDuckDBPathFn) {
    throw new Error("getDuckDBPath function not available");
  }
  return getDuckDBPathFn();
}

// Hook registry is passed as global during evaluation (like image-document extension)
interface ExtensionHookRegistry {
  registerHook(
    hookType: string,
    name: string,
    handler: (context: any) => Promise<any>,
  ): void;
}

declare const extensionHookRegistry: ExtensionHookRegistry | undefined;
const hookRegistry =
  typeof extensionHookRegistry !== "undefined" ? extensionHookRegistry : null;

// Type definitions
interface ExtractExcelOptions {
  filePath?: string;
  fileId?: string;
  sheets?: string[]; // Specific sheets to extract
  limit?: number; // Limit rows per sheet
  includeStructure?: boolean; // Include column info
}

interface ExtractExcelResult {
  text: string;
  structure?: ExcelStructure;
}

interface ExcelStructure {
  sheets: SheetInfo[];
  totalRows: number;
  totalSheets: number;
}

interface SheetInfo {
  name: string;
  rowCount: number;
  columns: string[];
  preview?: string[][];
}

interface DuckDBQueryResult {
  columns: string[];
  rows: string[][];
}

// Extend globalThis for extension context
declare global {
  var convId: string | undefined;
  var projectId: string | undefined;
  var tenantId: string | undefined;
}

/**
 * Escape single quotes in SQL strings
 */
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Execute DuckDB query and parse CSV result
 */
async function executeDuckDB(query: string): Promise<DuckDBQueryResult> {
  const { $ } = await import("bun");

  try {
    const duckdbExecutable = await getDuckDBPath();
    // Load extensions required for Excel support
    // read_xlsx is provided by the excel extension in DuckDB
    const extensionLoad = "INSTALL excel; LOAD excel;";
    const combinedQuery = `${extensionLoad} ${query}`;
    const result =
      await $`${duckdbExecutable} :memory: -csv -c ${combinedQuery}`.text();

    if (!result.trim()) {
      return { columns: [], rows: [] };
    }

    const lines = result
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    if (lines.length === 0) {
      return { columns: [], rows: [] };
    }

    // First line is headers
    const firstLine = lines[0];
    if (!firstLine) {
      return { columns: [], rows: [] };
    }
    const columns = parseCSVLine(firstLine);
    const rows = lines.slice(1).map((line) => parseCSVLine(line));

    return { columns, rows };
  } catch (error) {
    console.error("[ExcelDocument] DuckDB query failed:", error);
    return { columns: [], rows: [] };
  }
}

/**
 * Parse CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Get comprehensive Excel file structure
 */
async function getExcelStructure(filePath: string): Promise<ExcelStructure> {
  const escapedPath = escapeSqlString(filePath);

  // Query to discover structure
  const columnsQuery = `
    SELECT *
    FROM read_xlsx('${escapedPath}', all_varchar=true)
    LIMIT 1
  `;

  const columnsResult = await executeDuckDB(columnsQuery);

  if (!columnsResult || columnsResult.columns.length === 0) {
    // File might be empty or have no data
    return {
      sheets: [],
      totalRows: 0,
      totalSheets: 0,
    };
  }

  // Get total row count
  const countQuery = `
    SELECT COUNT(*) as row_count
    FROM read_xlsx('${escapedPath}', all_varchar=true)
  `;

  const countResult = await executeDuckDB(countQuery);
  const totalRows = parseInt(countResult.rows[0]?.[0] || "0", 10);

  // Create a single sheet entry (DuckDB reads all sheets by default)
  const sheets: SheetInfo[] = [
    {
      name: "Sheet1",
      rowCount: totalRows,
      columns: columnsResult.columns,
    },
  ];

  return {
    sheets,
    totalRows,
    totalSheets: 1,
  };
}

/**
 * Get preview data for a sheet
 */
async function getSheetPreview(
  filePath: string,
  sheetName: string,
  maxRows: number = 10,
): Promise<string[][]> {
  const escapedPath = escapeSqlString(filePath);
  const escapedSheet = escapeSqlString(sheetName);

  const previewQuery = `
    SELECT *
    FROM read_xlsx('${escapedPath}', sheet='${escapedSheet}', all_varchar=true)
    LIMIT ${maxRows + 1}
  `;

  const result = await executeDuckDB(previewQuery);

  // Combine header and rows
  const allData: string[][] = [result.columns, ...result.rows];
  return allData;
}

/**
 * Extract data from Excel file
 */
async function extractFromExcel(
  filePath: string,
  options: {
    sheets?: string[];
    limit?: number;
    includeStructure?: boolean;
  } = {},
): Promise<{ text: string; structure?: ExcelStructure }> {
  const { sheets: specificSheets, limit, includeStructure } = options;

  // Get structure
  const structure = await getExcelStructure(filePath);

  // Determine which sheets to process
  const sheetsToProcess =
    specificSheets && specificSheets.length > 0
      ? structure.sheets.filter((s) => specificSheets.includes(s.name))
      : structure.sheets;

  if (sheetsToProcess.length === 0) {
    return {
      text: "No sheets found or specified sheets do not exist.",
      structure,
    };
  }

  const lines: string[] = [];

  for (const sheet of sheetsToProcess) {
    lines.push(`\n${"=".repeat(60)}`);
    lines.push(`Sheet: ${sheet.name}`);
    lines.push(`Rows: ${sheet.rowCount} | Columns: ${sheet.columns.length}`);
    lines.push(`${"=".repeat(60)}`);

    // Get preview data
    const previewRows = limit
      ? await getSheetPreview(filePath, sheet.name, limit)
      : await getSheetPreview(filePath, sheet.name, sheet.rowCount);

    for (const row of previewRows) {
      const rowText = row.map((cell) => cell || "").join(" | ");
      lines.push(rowText);
    }

    if (limit && sheet.rowCount > limit) {
      lines.push(`\n... (${sheet.rowCount - limit} more rows)`);
    }

    lines.push("");
  }

  const text = lines.join("\n").trim();

  return includeStructure ? { text, structure } : { text };
}

/**
 * Generate description from Excel structure
 * Includes all sheet names, columns, and row counts for AI to query efficiently
 */
function generateDescription(
  structure: ExcelStructure,
  previewText: string,
  fileName: string,
  title?: string,
): string {
  const lines: string[] = [];

  // Use title if available, otherwise use filename
  const displayName = title ? `"${title}" (${fileName})` : fileName;
  const codeIdentifier = fileName; // Always use filename for code examples (fileId)

  lines.push(`## Excel File: ${displayName}`);
  lines.push(`**Total Sheets:** ${structure.totalSheets}`);
  lines.push(`**Total Rows:** ${structure.totalRows.toLocaleString()}`);
  lines.push("");

  // Quick start for common operations
  lines.push(`## Quick Start - Get Row Count`);
  lines.push(`To get the total row count:`);
  lines.push("```typescript");
  lines.push(`const result = await excel.read({`);
  lines.push(`  fileId: "${codeIdentifier}",`);
  lines.push(`  includeStructure: true`);
  lines.push(`});`);
  lines.push(`return { totalRows: result.structure.totalRows };`);
  lines.push("```");
  lines.push("");

  // Detailed structure for each sheet
  lines.push(`## Sheets Detail`);
  for (const sheet of structure.sheets) {
    lines.push(`### "${sheet.name}"`);
    lines.push(`- **Rows:** ${sheet.rowCount.toLocaleString()}`);
    lines.push(`- **Columns:** ${sheet.columns.length}`);
    if (sheet.columns.length > 0) {
      lines.push(`- **Column Names:**`);
      sheet.columns.forEach((col, idx) => {
        lines.push(`  ${idx + 1}. \`${col}\``);
      });
    }
    lines.push("");
  }

  // Usage examples with actual sheet info
  if (structure.sheets.length > 0) {
    const firstSheet = structure.sheets[0]!;
    lines.push(`## Usage Examples`);
    lines.push(`Get row count and column names:`);
    lines.push("```typescript");
    lines.push(`const result = await excel.read({`);
    lines.push(`  fileId: "${codeIdentifier}",`);
    lines.push(`  includeStructure: true`);
    lines.push(`});`);
    lines.push(`return {`);
    lines.push(`  totalRows: result.structure.totalRows,`);
    lines.push(`  columns: result.structure.sheets[0].columns`);
    lines.push(`};`);
    lines.push("```");
    lines.push("");
  }

  // Preview of first sheet
  if (structure.sheets.length > 0) {
    const firstSheet = structure.sheets[0]!;
    lines.push(`## Preview (First Sheet: "${firstSheet.name}")`);
    lines.push("```");
    const previewLines = previewText.split("\n").slice(0, 30);
    lines.push(previewLines.join("\n"));
    if (previewText.split("\n").length > 30) {
      lines.push(`... (${firstSheet.rowCount.toLocaleString()} total rows)`);
    }
    lines.push("```");
  }

  return lines.join("\n");
}

/**
 * Context documentation for the Excel Document extension
 */
const context = () => {
  return `
### Excel Extension

Extract and query Excel spreadsheets using DuckDB. Auto-extracts structure for Excel files on upload.

**Available Functions:**

#### query(options)
Execute SQL queries on CSV, Excel, Parquet, or JSON files.

\`\`\`typescript
// Recommended: Use fileId parameter for automatic path resolution
await excel.query({
  fileId: 'Product.xlsx',  // Optional but recommended - resolves to full path
  query: \`SELECT * FROM read_xlsx('Product.xlsx', header=true, all_varchar=true) WHERE Category = 'Electronics'\`,
  format: 'json'           // Optional: 'json' (default), 'csv', 'markdown', 'table'
});
\`\`\`

**Parameters:**
- \`fileId\` (optional): File ID in conversation storage - when provided, automatically replaces the fileId in your query with the full resolved path
- \`query\` (required): SQL query to execute
- \`format\` (optional): Output format - 'json' (default), 'csv', 'markdown', 'table'
- \`database\` (optional): Path to DuckDB database file (default: in-memory)
- \`readonly\` (optional): Open database in read-only mode (default: true)

**Returns:**
\`\`\`typescript
{
  data: Array<any>,       // Result rows (for JSON format)
  rowCount: number,       // Number of rows returned
  executionTime: number   // Execution time in milliseconds
}
\`\`\`

#### summarize(options)
Get Excel file structure, sheet names, column names, and row counts.

\`\`\`typescript
await excel.summarize({
  fileId: 'data.xlsx',    // File ID in conversation storage
  includeStructure: true  // Include file structure metadata
});
\`\`\`

**Parameters:**
- \`fileId\` (required): File ID in conversation storage
- \`filePath\` (optional): Full path to the Excel file
- \`sheets\` (optional): Array of sheet names to extract
- \`limit\` (optional): Maximum rows per sheet
- \`includeStructure\` (optional): Return structure metadata

**Returns:**
\`\`\`typescript
{
  text: string,              // Extracted data as formatted text
  structure?: {              // Only if includeStructure: true
    sheets: [{
      name: string,
      rowCount: number,
      columns: string[]
    }],
    totalRows: number,
    totalSheets: number
  }
}
\`\`\`

#### listFiles()
List all available data files (Excel, CSV, TSV) in the project.

\`\`\`typescript
await excel.listFiles();
\`\`\`

**Returns:**
\`\`\`typescript
{
  files: Array<{
    name: string,
    size: number,
    sizeHuman: string,
    modified: string,
    type: string  // 'XLSX', 'XLS', 'CSV', 'TSV'
  }>
}
\`\`\`

**Examples:**

1. **Get Excel file structure:**
\`\`\`typescript
const result = await excel.summarize({
  fileId: 'Product.xlsx',
  includeStructure: true
});
return {
  totalRows: result.structure.totalRows,
  sheets: result.structure.sheets.map(s => ({ name: s.name, rows: s.rowCount }))
};
\`\`\`

2. **Query Excel file with SQL (recommended with fileId):**
\`\`\`typescript
const data = await excel.query({
  fileId: 'Product.xlsx',  // Resolves to full path automatically
  query: \`SELECT * FROM read_xlsx('Product.xlsx',
    header=true,
    all_varchar=true)
  WHERE Category = 'Electronics'
  LIMIT 100\`
});
return { rows: data.rowCount, results: data.data };
\`\`\`

3. **List all available files:**
\`\`\`typescript
const files = await excel.listFiles();
return {
  excelFiles: files.files.filter(f => f.type === 'XLSX' || f.type === 'XLS'),
  csvFiles: files.files.filter(f => f.type === 'CSV' || f.type === 'TSV'),
  totalFiles: files.files.length
};
\`\`\`

4. **Aggregate data with SQL:**
\`\`\`typescript
const summary = await excel.query({
  fileId: 'sales.xlsx',
  query: \`SELECT
    Category,
    COUNT(*) as count,
    SUM(CAST(Price AS DOUBLE)) as total
  FROM read_xlsx('sales.xlsx', header=true, all_varchar=true)
  GROUP BY Category
  ORDER BY total DESC\`
});
return summary.data;
\`\`\`

**File Formats Supported:**
- Excel: read_xlsx('file.xlsx', header=true, all_varchar=true, sheet='Sheet1')
- CSV: 'file.csv' or read_csv_auto('file.csv')
- TSV: 'file.tsv' or read_csv_auto('file.tsv', delim='\\t')
- Parquet: 'file.parquet'
- JSON: 'file.json' or read_json_auto('file.json')

**Important Notes:**
- Use \`fileId\` parameter with \`query()\` for automatic path resolution (recommended)
- Excel file structure is auto-extracted on upload for quick inspection
- Use \`summarize()\` to get sheet names, columns, and row counts
- Use \`query()\` for complex filtering, aggregation, and joins
- Use \`all_varchar=true\` for Excel to prevent type inference issues
- Use CAST(column AS DOUBLE) when doing math on string columns
- For large files, query with SQL instead of extracting all data
`;
};

/**
 * Summarize Excel file structure - get sheets, columns, row counts
 */
async function summarize(
  options: ExtractExcelOptions,
): Promise<ExtractExcelResult> {
  if (!options || typeof options !== "object") {
    throw new Error("summarize requires an options object");
  }

  if (!options.filePath && !options.fileId) {
    throw new Error(
      "summarize requires either 'filePath' or 'fileId' parameter",
    );
  }

  let filePath = options.filePath!;

  // If fileId is provided, resolve to actual file path
  if (options.fileId) {
    const projectId = globalThis.projectId || "";
    const tenantId = globalThis.tenantId || "default";

    // Get project files directory (flat structure)
    const projectFilesDir = await getProjectFilesDir(projectId, tenantId);
    filePath = path.join(projectFilesDir, options.fileId);

    let fileFound = false;
    try {
      await fs.access(filePath);
      fileFound = true;
    } catch {
      // File not found, try prefix matching
    }

    // If not found, try prefix matching
    if (!fileFound) {
      try {
        const entries = await fs.readdir(projectFilesDir, {
          withFileTypes: true,
        });
        const fileEntry = entries.find((e) =>
          e.name.startsWith(options.fileId!),
        );
        if (fileEntry) {
          filePath = path.join(projectFilesDir, fileEntry.name);
          fileFound = true;
        }
      } catch {
        // Directory doesn't exist
      }
    }

    if (!fileFound) {
      throw new Error(`File not found: ${options.fileId}`);
    }
  }

  // Validate file is Excel
  if (!isExcelFile(filePath)) {
    throw new Error("File is not an Excel spreadsheet (.xlsx, .xls)");
  }

  try {
    const result = await extractFromExcel(filePath, {
      sheets: options.sheets,
      limit: options.limit,
      includeStructure: options.includeStructure,
    });

    return result;
  } catch (error: unknown) {
    throw new Error(
      `Excel extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Read Excel spreadsheet - alias for summarize()
 */
const read = async (
  options: ExtractExcelOptions,
): Promise<ExtractExcelResult> => summarize(options);

/**
 * SQL Query - Query any file format using SQL
 */
async function query(options: {
  query: string;
  fileId?: string; // Optional: resolve this fileId to full path and replace in query
  format?: "json" | "csv" | "markdown" | "table";
  readonly?: boolean;
  database?: string;
}): Promise<
  | { data: Record<string, unknown>[]; rowCount: number; executionTime: number }
  | { output: string; executionTime: number }
> {
  if (!options || typeof options !== "object") {
    throw new Error(
      "query requires an options object. Usage: await excel.query({ query: 'SELECT * FROM data.csv' })",
    );
  }

  if (!options.query) {
    throw new Error(
      "query requires 'query' parameter. Usage: await excel.query({ query: 'SELECT * FROM data.csv' })",
    );
  }

  const format = options.format || "json";
  const readonly = options.readonly !== false;
  const startTime = Date.now();

  try {
    // Import $ dynamically
    const { $ } = await import("bun");

    // Get the DuckDB executable path
    const duckdbExecutable = await getDuckDBPath();

    // Resolve fileId to full path if provided
    let finalQuery = options.query.trim();
    if (options.fileId) {
      const projectId = globalThis.projectId || "";
      const tenantId = globalThis.tenantId || "default";

      // Get project files directory
      const projectFilesDir = await getProjectFilesDir(projectId, tenantId);
      const resolvedPath = path.join(projectFilesDir, options.fileId);

      // Check if file exists with exact match
      let actualPath = resolvedPath;
      let fileFound = false;
      try {
        await fs.access(actualPath);
        fileFound = true;
      } catch {
        // File not found, try prefix matching
      }

      // If not found, try prefix matching (like summarize() does)
      if (!fileFound) {
        try {
          const entries = await fs.readdir(projectFilesDir, {
            withFileTypes: true,
          });
          const fileEntry = entries.find((e) =>
            e.name.startsWith(options.fileId!),
          );
          if (fileEntry) {
            actualPath = path.join(projectFilesDir, fileEntry.name);
            fileFound = true;
          }
        } catch {
          // Directory doesn't exist
        }
      }

      if (!fileFound) {
        throw new Error(`File not found: ${options.fileId}`);
      }

      // Escape the path for SQL and replace fileId in query
      const escapedPath = escapeSqlString(actualPath);

      // Replace the fileId in the query with the full path
      // We need to replace 'Product.xlsx' with '/full/path/Product.xlsx'
      // The regex captures the quote character so we can preserve it
      const fileIdPattern = new RegExp(
        `(['"])${escapeRegex(options.fileId)}\\1|` + // Quoted with same quotes (captured)
          `'${escapeRegex(options.fileId)}'|` + // Single quoted
          `"${escapeRegex(options.fileId)}"|` + // Double quoted
          `${escapeRegex(options.fileId)}(?=[\\s,)])`, // Unquoted
        "g",
      );

      // Use a replacement function to handle different quote styles
      finalQuery = finalQuery.replace(fileIdPattern, (match, quote) => {
        if (quote) {
          // Match was 'file' or "file" - preserve the quote character
          return quote + escapedPath + quote;
        } else if (match.startsWith("'")) {
          // Single quoted (fallback)
          return "'" + escapedPath + "'";
        } else if (match.startsWith('"')) {
          // Double quoted (fallback)
          return '"' + escapedPath + '"';
        } else {
          // Unquoted - add single quotes
          return "'" + escapedPath + "'";
        }
      });
    }

    // Build DuckDB command
    let command;

    if (options.database) {
      command = [
        duckdbExecutable,
        readonly ? "-readonly" : "",
        options.database,
      ].filter(Boolean);
    } else {
      command = [duckdbExecutable, ":memory:"];
    }

    // DuckDB CLI flags based on format
    const formatFlags = {
      json: "-json",
      csv: "-csv",
      markdown: "-markdown",
      table: "-table",
    };

    const formatFlag = formatFlags[format] || "-json";

    // Load extensions required for Excel support
    // read_xlsx is provided by the excel extension in DuckDB
    const extensionLoad = "INSTALL excel; LOAD excel;";
    const combinedQuery = `${extensionLoad} ${finalQuery}`;

    // Execute DuckDB query using Bun.$
    const result = await $`${command} ${formatFlag} -c ${combinedQuery}`.text();

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
          globalThis.__broadcastInspection("duckdb", {
            ...extensionResult,
          });
        }

        return extensionResult;
      } catch (parseError: unknown) {
        // Return raw output for debugging
        const errorMessage =
          parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(
          `Failed to parse JSON result: ${errorMessage}\nRaw output (first 500 chars): ${trimmedResult.substring(0, 500)}`,
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
}

/**
 * List available data files in the project (Excel, CSV, TSV)
 */
async function listFiles(): Promise<{
  files: Array<{
    name: string;
    size: number;
    sizeHuman: string;
    modified: string;
    type: string;
  }>;
}> {
  const projectId = globalThis.projectId || "";
  const tenantId = globalThis.tenantId || "default";

  const projectFilesDir = await getProjectFilesDir(projectId, tenantId);

  try {
    const entries = await fs.readdir(projectFilesDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const name = entry.name.toLowerCase();
        const ext = name.split(".").pop();
        return ["xlsx", "xls", "csv", "tsv"].includes(ext || "");
      })
      .map(async (entry) => {
        const filePath = path.join(projectFilesDir, entry.name);
        const stats = await fs.stat(filePath);
        const ext = entry.name.split(".").pop() || "";
        return {
          name: entry.name,
          size: stats.size,
          sizeHuman: formatBytes(stats.size),
          modified: stats.mtime.toISOString(),
          type: ext.toUpperCase(),
        };
      });

    return { files: await Promise.all(files) };
  } catch (error) {
    // Directory doesn't exist or is empty
    return { files: [] };
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// Register hook for automatic Excel analysis on upload
if (hookRegistry) {
  hookRegistry.registerHook(
    "afterFileUpload",
    "excel-document",
    async (_context: any) => {
      console.log(
        "[ExcelDocument] Hook called for file:",
        _context.fileName,
        "type:",
        _context.fileType,
      );

      // Only process Excel files
      if (
        !_context.fileType.match(
          /(^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))|\.xls|\.xlsx$/,
        )
      ) {
        console.log("[ExcelDocument] Skipping non-Excel file");
        return;
      }

      console.log("[ExcelDocument] Processing Excel file:", _context.fileName);

      try {
        // Get comprehensive structure (sheets, columns, row counts)
        console.log(
          "[ExcelDocument] Getting structure for:",
          _context.filePath,
        );
        const structure = await getExcelStructure(_context.filePath);
        console.log(
          "[ExcelDocument] Found sheets:",
          structure.sheets
            .map((s) => `${s.name} (${s.rowCount} rows)`)
            .join(", "),
        );

        // Get preview of first sheet
        let previewText = "";
        if (structure.sheets.length > 0) {
          const firstSheet = structure.sheets[0]!;
          const previewData = await getSheetPreview(
            _context.filePath,
            firstSheet.name,
            20,
          );
          previewText = previewData
            .map((row) => row.map((cell) => cell || "").join(" | "))
            .join("\n");
        }

        console.log('[ExcelDocument] About to call utils.generateTitle, utils is:', typeof utils);
        console.log('[ExcelDocument] utils.generateTitle is:', typeof utils?.generateTitle);

        // Generate title using AI helper (injected utility) - BEFORE description
        const title = await utils.generateTitle({
          systemPrompt: "Generate a concise 3-8 word title for an Excel spreadsheet based on its content. Return only the title, no quotes.",
          content: `File: ${_context.fileName}\n\nSheets: ${structure.sheets.map((s) => `${s.name} (${s.rowCount} rows)`).join(", ")}\n\nPreview:\n${previewText}`,
          label: "ExcelDocument",
        });

        console.log('[ExcelDocument] generateTitle returned:', title);

        // Generate structured description for AI, now with title
        const description = generateDescription(
          structure,
          previewText,
          _context.fileName,
          title || undefined,
        );
        console.log(
          "[ExcelDocument] Generated structured description for:",
          _context.fileName,
          "length:",
          description.length,
        );

        return { description, title };
      } catch (error) {
        console.error("[ExcelDocument] Hook failed:", error);
        console.error(
          "[ExcelDocument] Error stack:",
          error instanceof Error ? error.stack : String(error),
        );
        return {};
      }
    },
  );
  console.log("[ExcelDocument] Registered afterFileUpload hook");
} else {
  console.log(
    "[ExcelDocument] extensionHookRegistry not available, hook not registered",
  );
}

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  context,
  query,
  summarize,
  listFiles,
};
