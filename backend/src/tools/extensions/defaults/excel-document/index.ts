/**
 * Excel Document Extension
 * Extract and explore Excel spreadsheets (.xlsx, .xls) using DuckDB
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Dynamically import all dependencies to avoid esbuild transpilation issues
let documentExtractorModule: any = null;
async function isExcelFile(fileName: string): boolean {
  if (!documentExtractorModule) {
    documentExtractorModule = await import(`${process.cwd()}/backend/src/utils/document-extractor.ts`);
  }
  return documentExtractorModule.isExcelFile(fileName);
}

let configPathsModule: any = null;
async function getProjectFilesDir(projectId: string, tenantId: string | number): string {
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
async function executeDuckDB(query: string): Promise<DuckDBQueryResult | null> {
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
    const columns = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    return { columns, rows };
  } catch (error) {
    console.error('[ExcelDocument] DuckDB query failed:', error);
    // Return null to indicate DuckDB is not available
    return null;
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
 * Get comprehensive Excel file structure using XLSX library
 */
async function getExcelStructureXLSX(filePath: string): Promise<ExcelStructure> {
  try {
    const createRequire = (moduleUrl: string) => {
      const module = require('module');
      const require = module.createRequire(import.meta.url);
      return require;
    };
    const require = createRequire(import.meta.url);
    const XLSX = require('xlsx');

    // Read the Excel file
    const buffer = await fs.readFile(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheets: SheetInfo[] = [];

    // Process each sheet
    workbook.SheetNames.forEach((sheetName: string) => {
      const worksheet = workbook.Sheets[sheetName];

      // Convert sheet to JSON with header: 1 to get array of arrays
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (data.length > 0) {
        // First row contains headers
        const headers = data[0].map(cell => String(cell || ''));

        // Count data rows (excluding header)
        const rowCount = Math.max(0, data.length - 1);

        sheets.push({
          name: sheetName,
          rowCount: rowCount,
          columns: headers,
        });
      }
    });

    const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);

    return {
      sheets,
      totalRows,
      totalSheets: sheets.length,
    };
  } catch (error) {
    console.error('[ExcelDocument] XLSX structure extraction failed:', error);
    return {
      sheets: [],
      totalRows: 0,
      totalSheets: 0,
    };
  }
}

/**
 * Get comprehensive Excel file structure
 */
async function getExcelStructure(filePath: string): Promise<ExcelStructure> {
  // First, try DuckDB for efficient structure discovery
  const escapedPath = escapeSqlString(filePath);

  // Try to query the file to discover structure
  // We'll query the first sheet to get columns, then get total rows
  const columnsQuery = `
    SELECT *
    FROM read_xlsx('${escapedPath}', all_varchar=true)
    LIMIT 1
  `;

  const columnsResult = await executeDuckDB(columnsQuery);

  // If DuckDB is not available or failed, fall back to XLSX library
  if (!columnsResult) {
    console.log('[ExcelDocument] DuckDB not available, falling back to XLSX library');
    return await getExcelStructureXLSX(filePath);
  }

  if (columnsResult.columns.length === 0) {
    // File might be empty or have no data, try XLSX library as fallback
    console.log('[ExcelDocument] DuckDB found no columns, trying XLSX library');
    return await getExcelStructureXLSX(filePath);
  }

  // Get total row count
  const countQuery = `
    SELECT COUNT(*) as row_count
    FROM read_xlsx('${escapedPath}', all_varchar=true)
  `;

  const countResult = await executeDuckDB(countQuery);

  // If count query failed, fall back to XLSX library
  if (!countResult) {
    console.log('[ExcelDocument] DuckDB count query failed, falling back to XLSX library');
    return await getExcelStructureXLSX(filePath);
  }

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
 * Get preview data for a sheet using XLSX library
 */
async function getSheetPreviewXLSX(filePath: string, sheetName: string, maxRows: number = 10): Promise<string[][]> {
  try {
    const createRequire = (moduleUrl: string) => {
      const module = require('module');
      const require = module.createRequire(import.meta.url);
      return require;
    };
    const require = createRequire(import.meta.url);
    const XLSX = require('xlsx');

    // Read the Excel file
    const buffer = await fs.readFile(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Find the requested sheet
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      console.warn(`[ExcelDocument] Sheet "${sheetName}" not found`);
      return [];
    }

    // Convert sheet to JSON with header: 1 to get array of arrays
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    // Limit rows (add 1 to include header)
    const limitedData = data.slice(0, maxRows + 1);

    // Convert all cells to strings
    return limitedData.map(row =>
      row.map(cell => String(cell || ''))
    );
  } catch (error) {
    console.error('[ExcelDocument] XLSX preview failed:', error);
    return [];
  }
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

  // If DuckDB is not available or failed, fall back to XLSX library
  if (!result) {
    console.log('[ExcelDocument] DuckDB preview failed, falling back to XLSX library');
    return await getSheetPreviewXLSX(filePath, sheetName, maxRows);
  }

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
    lines.push(`## Preview (First Sheet: "${structure.sheets[0].name}")`);
    lines.push('```');
    const previewLines = previewText.split('\n').slice(0, 30);
    lines.push(previewLines.join('\n'));
    if (previewText.split('\n').length > 30) {
      lines.push(`... (${structure.sheets[0].rowCount.toLocaleString()} total rows)`);
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
  '1. **Check file structure first (recommended):**' +
  'When a file is uploaded, check its metadata to see available sheets and columns, then query precisely using the duckdb extension.' +
  '' +
  'Example: Query specific sheet' +
  '  await duckdb({ query: "SELECT * FROM read_xlsx(FILE_PATH, sheet=SHEET_NAME, all_varchar=true) LIMIT 100" });' +
  '' +
  '2. **Extract specific sheets with row limit:**' +
  '`' + '`' + '`' + 'typescript' +
  'const result = await excelDocument.extract({' +
  '  fileId: "sales_data.xlsx",' +
  '  sheets: ["Q1", "Q2"],' +
  '  limit: 50' +
  '});' +
  'return result.text;' +
  '`' + '`' + '`' +
  '' +
  '3. **Get structure only for exploration:**' +
  '`' + '`' + '`' + 'typescript' +
  'const info = await excelDocument.extract({' +
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
          const previewData = await getSheetPreview(_context.filePath, structure.sheets[0].name, 20);
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
