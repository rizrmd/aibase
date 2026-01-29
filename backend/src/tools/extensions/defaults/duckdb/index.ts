/**
 * DuckDB Extension
 * Query CSV, Excel, Parquet, and JSON files using SQL
 * Auto-extracts structure for Excel files on upload
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Dynamically import all dependencies to avoid esbuild transpilation issues
let documentExtractorModule: any = null;
async function isExcelFile(fileName: string): Promise<boolean> {
  if (!documentExtractorModule) {
    documentExtractorModule = await import(`${process.cwd()}/backend/src/utils/document-extractor.ts`);
  }
  return documentExtractorModule.isExcelFile(fileName);
}

let configPathsModule: any = null;
async function getProjectFilesDir(projectId: string, tenantId: string | number): Promise<string> {
  if (!configPathsModule) {
    configPathsModule = await import(`${process.cwd()}/backend/src/config/paths.ts`);
  }
  return configPathsModule.getProjectFilesDir(projectId, tenantId);
}

let getDuckDBPathFn: (() => Promise<string>) | null = null;
async function getDuckDBPath(): Promise<string> {
  if (!getDuckDBPathFn) {
    // Use absolute path from backend directory to avoid relative path resolution issues
    const module = await import(`${process.cwd()}/backend/src/binaries/duckdb.ts`);
    getDuckDBPathFn = module.getDuckDBPath;
  }
  if (!getDuckDBPathFn) {
    throw new Error('getDuckDBPath function not available');
  }
  return getDuckDBPathFn();
}

// Hook registry is passed as global during evaluation (like image-document extension)
interface ExtensionHookRegistry {
  registerHook(hookType: string, name: string, handler: (context: any) => Promise<any>): void;
}

declare const extensionHookRegistry: ExtensionHookRegistry | undefined;
const hookRegistry = typeof extensionHookRegistry !== 'undefined' ? extensionHookRegistry : null;

// Type definitions
interface ExtractExcelOptions {
  filePath?: string;
  fileId?: string;
  sheets?: string[];        // Specific sheets to extract
  limit?: number;           // Limit rows per sheet
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
 * Execute DuckDB query and parse CSV result
 */
async function executeDuckDB(query: string): Promise<DuckDBQueryResult> {
  const { $ } = await import('bun');

  try {
    const duckdbExecutable = await getDuckDBPath();
    const result = await $`${duckdbExecutable} :memory: -csv -c ${query}`.text();

    if (!result.trim()) {
      return { columns: [], rows: [] };
    }

    const lines = result.trim().split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return { columns: [], rows: [] };
    }

    // First line is headers
    const firstLine = lines[0];
    if (!firstLine) {
      return { columns: [], rows: [] };
    }
    const columns = parseCSVLine(firstLine);
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    return { columns, rows };
  } catch (error) {
    console.error('[ExcelDocument] DuckDB query failed:', error);
    return { columns: [], rows: [] };
  }
}

/**
 * Parse CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
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
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
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
  const totalRows = parseInt(countResult.rows[0]?.[0] || '0', 10);

  // Create a single sheet entry (DuckDB reads all sheets by default)
  const sheets: SheetInfo[] = [
    {
      name: 'Sheet1',
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
async function getSheetPreview(filePath: string, sheetName: string, maxRows: number = 10): Promise<string[][]> {
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
  } = {}
): Promise<{ text: string; structure?: ExcelStructure }> {
  const { sheets: specificSheets, limit, includeStructure } = options;

  // Get structure
  const structure = await getExcelStructure(filePath);

  // Determine which sheets to process
  const sheetsToProcess = specificSheets && specificSheets.length > 0
    ? structure.sheets.filter(s => specificSheets.includes(s.name))
    : structure.sheets;

  if (sheetsToProcess.length === 0) {
    return { text: 'No sheets found or specified sheets do not exist.', structure };
  }

  const lines: string[] = [];

  for (const sheet of sheetsToProcess) {
    lines.push(`\n${'='.repeat(60)}`);
    lines.push(`Sheet: ${sheet.name}`);
    lines.push(`Rows: ${sheet.rowCount} | Columns: ${sheet.columns.length}`);
    lines.push(`${'='.repeat(60)}`);

    // Get preview data
    const previewRows = limit
      ? await getSheetPreview(filePath, sheet.name, limit)
      : await getSheetPreview(filePath, sheet.name, sheet.rowCount);

    for (const row of previewRows) {
      const rowText = row.map(cell => cell || '').join(' | ');
      lines.push(rowText);
    }

    if (limit && sheet.rowCount > limit) {
      lines.push(`\n... (${sheet.rowCount - limit} more rows)`);
    }

    lines.push('');
  }

  const text = lines.join('\n').trim();

  return includeStructure
    ? { text, structure }
    : { text };
}

/**
 * Generate description from Excel structure
 * Includes all sheet names, columns, and row counts for AI to query efficiently
 */
function generateDescription(structure: ExcelStructure, previewText: string): string {
  const lines: string[] = [];

  lines.push(`## Excel File Structure`);
  lines.push(`**Total Sheets:** ${structure.totalSheets}`);
  lines.push(`**Total Rows:** ${structure.totalRows.toLocaleString()}`);
  lines.push('');

  // Quick start for common operations
  lines.push(`## Quick Start - Get Row Count`);
  lines.push(`To get the total row count:`);
  lines.push('```typescript');
  lines.push(`const result = await excelDocument.read({`);
  lines.push(`  fileId: "YOUR_FILENAME.xlsx",`);
  lines.push(`  includeStructure: true`);
  lines.push(`});`);
  lines.push(`return { totalRows: result.structure.totalRows };`);
  lines.push('```');
  lines.push('');

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
    lines.push('');
  }

  // Usage examples with actual sheet info
  if (structure.sheets.length > 0) {
    const firstSheet = structure.sheets[0]!;
    lines.push(`## Usage Examples`);
    lines.push(`Get row count and column names:`);
    lines.push('```typescript');
    lines.push(`const result = await excelDocument.read({`);
    lines.push(`  fileId: "YOUR_FILE.xlsx",`);
    lines.push(`  includeStructure: true`);
    lines.push(`});`);
    lines.push(`return {`);
    lines.push(`  totalRows: result.structure.totalRows,`);
    lines.push(`  columns: result.structure.sheets[0].columns`);
    lines.push(`};`);
    lines.push('```');
    lines.push('');
  }

  // Preview of first sheet
  if (structure.sheets.length > 0) {
    const firstSheet = structure.sheets[0]!;
    lines.push(`## Preview (First Sheet: "${firstSheet.name}")`);
    lines.push('```');
    const previewLines = previewText.split('\n').slice(0, 30);
    lines.push(previewLines.join('\n'));
    if (previewText.split('\n').length > 30) {
      lines.push(`... (${firstSheet.rowCount.toLocaleString()} total rows)`);
    }
    lines.push('```');
  }

  return lines.join('\n');
}

/**
 * Context documentation for the DuckDB extension
 */
const context = () => {
  return `
### DuckDB Extension

Query CSV, Excel, Parquet, and JSON files using SQL. Auto-extracts structure for Excel files on upload.

**Available Functions:**

#### duckdb(options)
Execute SQL queries on CSV, Excel, Parquet, or JSON files.

\`\`\`typescript
await duckdb({
  query: 'SELECT * FROM data.csv LIMIT 10',
  format: 'json',        // Optional: 'json' (default), 'csv', 'markdown', 'table'
  readonly: true,        // Optional: readonly mode (default: true)
  database: ':memory:'   // Optional: database file path (default: ':memory:')
});
\`\`\`

**Parameters:**
- \`query\` (required): SQL query to execute
- \`format\` (optional): Output format - 'json' (default), 'csv', 'markdown', 'table'
- \`readonly\` (optional): Enable readonly mode (default: true)
- \`database\` (optional): Database file path (default: ':memory:' for in-memory)

**Returns:**
\`\`\`typescript
{
  data: Array<any>,       // Result rows (for JSON format)
  rowCount: number,       // Number of rows returned
  executionTime: number   // Execution time in milliseconds
}
\`\`\`

#### read(options) / extract(options)
Extract data from Excel spreadsheets with optional structure information (convenience wrapper).

\`\`\`typescript
await duckdb.read({
  fileId: 'data.xlsx',    // File ID in conversation storage
  sheets: ['Sheet1'],     // Optional: specific sheets to extract
  limit: 100,             // Optional: max rows per sheet
  includeStructure: true  // Optional: include file structure metadata
});
\`\`\`

**Examples:**

1. **Query CSV file:**
\`\`\`typescript
const result = await duckdb({
  query: 'SELECT * FROM sales.csv LIMIT 10'
});
return { count: result.rowCount, data: result.data };
\`\`\`

2. **Query Excel file:**
\`\`\`typescript
const excel = await duckdb({
  query: \`SELECT * FROM read_xlsx('report.xlsx',
    header=true,
    all_varchar=true,
    sheet='Sheet1')
  WHERE revenue IS NOT NULL
  LIMIT 20\`
});
return excel.data;
\`\`\`

3. **Get Excel structure (easiest):**
\`\`\`typescript
const result = await duckdb.read({
  fileId: 'Product.xlsx',
  includeStructure: true
});
return {
  totalRows: result.structure.totalRows,
  columns: result.structure.sheets[0].columns,
  sheetNames: result.structure.sheets.map(s => s.name)
};
\`\`\`

4. **Aggregation query:**
\`\`\`typescript
const summary = await duckdb({
  query: \`SELECT
    category,
    SUM(CAST(amount AS DOUBLE)) as total
  FROM read_xlsx('sales.xlsx', header=true, all_varchar=true)
  GROUP BY category
  ORDER BY total DESC\`
});
return summary.data;
\`\`\`

5. **Join multiple files:**
\`\`\`typescript
const joined = await duckdb({
  query: \`
    SELECT u.name, s.score
    FROM 'users.csv' u
    JOIN 'scores.parquet' s ON u.id = s.user_id
    LIMIT 10
  \`
});
return joined.data;
\`\`\`

6. **Query Parquet/JSON files:**
\`\`\`typescript
const data = await duckdb({
  query: "SELECT * FROM 'data.parquet' WHERE date > '2024-01-01'"
});
return data.data;
\`\`\`

**File Formats Supported:**
- CSV: 'file.csv' or read_csv_auto('file.csv')
- Excel: read_xlsx('file.xlsx', header=true, all_varchar=true, sheet='Sheet1')
- Parquet: 'file.parquet'
- JSON: 'file.json' or read_json_auto('file.json')

**Important Notes:**
- DuckDB queries files directly without loading into memory
- Use all_varchar=true for Excel to prevent type inference issues
- Use CAST(column AS DOUBLE) when doing math on string columns
- In-memory database by default (:memory:)
- For Excel files, structure is auto-extracted on upload for quick inspection
- Use read() for simple Excel data extraction, duckdb() for complex SQL queries
`;
};

/**
 * Extract text from Excel spreadsheet
 */
const extract = async (options: ExtractExcelOptions): Promise<ExtractExcelResult> => {
  if (!options || typeof options !== "object") {
    throw new Error("extractExcel requires an options object");
  }

  if (!options.filePath && !options.fileId) {
    throw new Error("extractExcel requires either 'filePath' or 'fileId' parameter");
  }

  let filePath = options.filePath!;

  // If fileId is provided, resolve to actual file path
  if (options.fileId) {
    const projectId = globalThis.projectId || '';
    const tenantId = globalThis.tenantId || 'default';

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
        const entries = await fs.readdir(projectFilesDir, { withFileTypes: true });
        const fileEntry = entries.find(e => e.name.startsWith(options.fileId!));
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
    throw new Error(`Excel extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Read Excel spreadsheet - alias for extract()
 */
const read = async (options: ExtractExcelOptions): Promise<ExtractExcelResult> => extract(options);

/**
 * DuckDB SQL Query - Query any file format using SQL
 */
async function duckdb(options: {
  query: string;
  format?: "json" | "csv" | "markdown" | "table";
  readonly?: boolean;
  database?: string;
}): Promise<{ data: Record<string, unknown>[]; rowCount: number; executionTime: number } | { output: string; executionTime: number }> {
  if (!options || typeof options !== "object") {
    throw new Error("duckdb requires an options object. Usage: await duckdb({ query: 'SELECT * FROM data.csv' })");
  }

  if (!options.query) {
    throw new Error("duckdb requires 'query' parameter. Usage: await duckdb({ query: 'SELECT * FROM data.csv' })");
  }

  const format = options.format || "json";
  const readonly = options.readonly !== false;
  const startTime = Date.now();

  try {
    // Import $ dynamically
    const { $ } = await import('bun');

    // Get the DuckDB executable path
    const duckdbExecutable = await getDuckDBPath();

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
}

/**
 * Convenience method - alias for extract()
 */
const extractXLSX = async (options: ExtractExcelOptions): Promise<ExtractExcelResult> => extract(options);

/**
 * Convenience method - alias for read()
 */
const xlsxReader = async (options: ExtractExcelOptions): Promise<ExtractExcelResult> => extract(options);

// Register hook for automatic Excel analysis on upload
if (hookRegistry) {
  hookRegistry.registerHook(
    'afterFileUpload',
    'duckdb',
    async (_context: any) => {
      console.log('[DuckDB] Hook called for file:', _context.fileName, 'type:', _context.fileType);

      // Only process Excel files
      if (!_context.fileType.match(/(^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))|\.xls|\.xlsx$/)) {
        console.log('[DuckDB] Skipping non-Excel file');
        return;
      }

      console.log('[DuckDB] Processing Excel file:', _context.fileName);

      try {
        // Get comprehensive structure (sheets, columns, row counts)
        console.log('[DuckDB] Getting structure for:', _context.filePath);
        const structure = await getExcelStructure(_context.filePath);
        console.log('[DuckDB] Found sheets:', structure.sheets.map(s => `${s.name} (${s.rowCount} rows)`).join(', '));

        // Get preview of first sheet
        let previewText = '';
        if (structure.sheets.length > 0) {
          const firstSheet = structure.sheets[0]!;
          const previewData = await getSheetPreview(_context.filePath, firstSheet.name, 20);
          previewText = previewData
            .map(row => row.map(cell => cell || '').join(' | '))
            .join('\n');
        }

        // Generate structured description for AI
        const description = generateDescription(structure, previewText);
        console.log('[DuckDB] Generated structured description for:', _context.fileName, 'length:', description.length);

        return { description };
      } catch (error) {
        console.error('[DuckDB] Hook failed:', error);
        console.error('[DuckDB] Error stack:', error instanceof Error ? error.stack : String(error));
        return {};
      }
    }
  );
  console.log('[DuckDB] Registered afterFileUpload hook');
} else {
  console.log('[DuckDB] extensionHookRegistry not available, hook not registered');
}

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  // Excel document functions
  extract,
  read,
  extractXLSX,
  xlsxReader,
  // SQL query function
  duckdb,
};
