/**
 * Excel Document Extension
 * Extract and explore Excel spreadsheets (.xlsx, .xls) using DuckDB
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

  // Query examples for AI
  lines.push(`## Query Examples`);
  lines.push(`Use the duckdb extension to query this Excel file:`);
  lines.push('```');
  lines.push(`// Query specific sheet`);
  lines.push(`await duckdb({`);
  lines.push(`  query: \`SELECT * FROM read_xlsx('FILE_PATH', sheet='SHEET_NAME', all_varchar=true) LIMIT 10\``);
  lines.push(`});`);
  lines.push('');
  lines.push(`// Filter by column`);
  lines.push(`await duckdb({`);
  lines.push(`  query: \`SELECT * FROM read_xlsx('FILE_PATH', sheet='SHEET_NAME', all_varchar=true) WHERE COLUMN_NAME = 'value'\``);
  lines.push(`});`);
  lines.push('```');
  lines.push('');

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
 * Context documentation for the Excel Document extension
 */
const context = () =>
  '' +
  '### Excel Document Extension' +
  '' +
  'Extract and explore Excel spreadsheets (.xlsx, .xls) using DuckDB for efficient analysis.' +
  '' +
  '**Automatic Structure Detection:**' +
  'When an Excel file is uploaded, the extension automatically extracts and stores the complete structure (all sheet names, column names, and row counts) in the file metadata. The AI can immediately see what data is available without reading the entire file.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### extract(options)' +
  'Extract data from Excel spreadsheet with optional structure information.' +
  '`' + '`' + '`' + 'typescript' +
  'await excelDocument.extract({' +
  '  filePath: "/path/to/spreadsheet.xlsx",  // Full path to file' +
  '  fileId: "data.xlsx",                   // Or file ID in conversation' +
  '  sheets: ["Sheet1", "Sheet2"],          // Optional: specific sheets to extract' +
  '  limit: 100,                            // Optional: max rows per sheet (default: all)' +
  '  includeStructure: true                 // Optional: include file structure metadata' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`filePath\\` (optional): Full path to the Excel file' +
  '- \\`fileId\\` (optional): File ID in conversation storage' +
  '- \\`sheets\\` (optional): Array of sheet names to extract (default: all sheets)' +
  '- \\`limit\\` (optional): Maximum rows per sheet (default: unlimited)' +
  '- \\`includeStructure\\` (optional): Return structure metadata (default: false)' +
  '- Either \\`filePath\\` or \\`fileId\\` is required' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  text: string,              // Extracted data as formatted text' +
  '  structure?: {              // Only if includeStructure: true' +
  '    sheets: [{' +
  '      name: string,' +
  '      rowCount: number,' +
  '      columns: string[]' +
  '    }],' +
  '    totalRows: number,' +
  '    totalSheets: number' +
  '  }' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Get total row count and column names (most common):**' +
  '`' + '`' + '`' + 'typescript' +
  'const result = await excelDocument.read({' +
  '  fileId: "Product.xlsx",' +
  '  includeStructure: true' +
  '});' +
  'return {' +
  '  totalRows: result.structure.totalRows,' +
  '  columns: result.structure.sheets[0].columns,' +
  '  sheetName: result.structure.sheets[0].name' +
  '};' +
  '`' + '`' + '`' +
  '' +
  '2. **Parse text data to get rows as arrays:**' +
  '`' + '`' + '`' + 'typescript' +
  'const result = await excelDocument.read({' +
  '  fileId: "data.xlsx",' +
  '  limit: 100' +
  '});' +
  'const lines = result.text.split("\\n");' +
  'const headers = lines[0].split(" | ");' +
  'const rows = lines.slice(1).map(line => line.split(" | "));' +
  'return { headers, totalRows: rows.length, sampleRows: rows.slice(0, 5) };' +
  '`' + '`' + '`' +
  '' +
  '3. **Check file structure first (recommended for large files):**' +
  'When a file is uploaded, check its metadata to see available sheets and columns, then query precisely using the duckdb extension.' +
  '' +
  'Example: Query specific sheet' +
  '  await duckdb({ query: "SELECT * FROM read_xlsx(FILE_PATH, sheet=SHEET_NAME, all_varchar=true) LIMIT 100" });' +
  '' +
  '4. **Extract specific sheets with row limit:**' +
  '`' + '`' + '`' + 'typescript' +
  'const result = await excelDocument.read({' +
  '  fileId: "sales_data.xlsx",' +
  '  sheets: ["Q1", "Q2"],' +
  '  limit: 50' +
  '});' +
  'return result.text;' +
  '`' + '`' + '`' +
  '' +
  '5. **Get structure only for exploration:**' +
  '`' + '`' + '`' + 'typescript' +
  'const info = await excelDocument.read({' +
  '  filePath: "/data/report.xlsx",' +
  '  limit: 0,' +
  '  includeStructure: true' +
  '});' +
  'return {' +
  '  sheets: info.structure.sheets.map(s => ({ name: s.name, rows: s.rowCount, columns: s.columns }))' +
  '};' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- **Automatic structure extraction** happens on upload - check file metadata first' +
  '- Use \\`duckdb\\` extension for SQL queries (more efficient than extracting all data)' +
  '- DuckDB can filter, aggregate, and join Excel data directly' +
  '- Structure metadata shows exact sheet names, column names, and row counts' +
  '- All text values preserved (\\`all_varchar=true\\`) to prevent type inference issues' +
  '- Uses \\`read_xlsx()\\` function for efficient reading without loading entire file';

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
    'excel-document',
    async (_context: any) => {
      console.log('[ExcelDocument] Hook called for file:', _context.fileName, 'type:', _context.fileType);

      // Only process Excel files
      if (!_context.fileType.match(/(^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))|\.xls|\.xlsx$/)) {
        console.log('[ExcelDocument] Skipping non-Excel file');
        return;
      }

      console.log('[ExcelDocument] Processing Excel file:', _context.fileName);

      try {
        // Get comprehensive structure (sheets, columns, row counts)
        console.log('[ExcelDocument] Getting structure for:', _context.filePath);
        const structure = await getExcelStructure(_context.filePath);
        console.log('[ExcelDocument] Found sheets:', structure.sheets.map(s => `${s.name} (${s.rowCount} rows)`).join(', '));

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
        console.log('[ExcelDocument] Generated structured description for:', _context.fileName, 'length:', description.length);

        return { description };
      } catch (error) {
        console.error('[ExcelDocument] Hook failed:', error);
        console.error('[ExcelDocument] Error stack:', error instanceof Error ? error.stack : String(error));
        return {};
      }
    }
  );
  console.log('[ExcelDocument] Registered afterFileUpload hook');
} else {
  console.log('[ExcelDocument] extensionHookRegistry not available, hook not registered');
}

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  extract,
  read,
  extractXLSX,
  xlsxReader,
};
