/**
 * Excel Document Extension
 * Extract text content from Excel spreadsheets (.xlsx, .xls)
 * Enhanced version of extract-xlsx with additional capabilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { extractTextFromExcel, isExcelFile } from '../../../../utils/document-extractor';
import { getConversationFilesDir } from '../../../../config/paths';

// Type definitions
interface ExtractExcelOptions {
  filePath?: string;
  fileId?: string;
}

interface ExtractExcelResult {
  text: string;
}

// Extend globalThis for extension context
declare global {
  var convId: string | undefined;
  var projectId: string | undefined;
  var tenantId: string | undefined;
}

/**
 * Context documentation for the Excel Document extension
 */
const context = () =>
  '' +
  '### Excel Document Extension' +
  '' +
  'Extract text and data from Excel spreadsheets (.xlsx, .xls).' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### extract(options)' +
  'Extract text from Excel spreadsheet.' +
  '`' + '`' + '`' + 'typescript' +
  'await excelDocument.extract({' +
  '  filePath: "/path/to/spreadsheet.xlsx",  // Full path to file' +
  '  fileId: "data.xlsx"                    // Or file ID in conversation' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`filePath\\` (optional): Full path to the Excel file' +
  '- \\`fileId\\` (optional): File ID in conversation storage' +
  '- Either \\`filePath\\` or \\`fileId\\` is required' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  text: string,        // Extracted text content from all sheets' +
  '  sheetCount: number,  // Number of sheets in workbook' +
  '  fileName: string     // File name' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Extract data from Excel by file ID:**' +
  '`' + '`' + '`' + 'typescript' +
  'const excel = await excelDocument.extract({' +
  '  fileId: "sales_data.xlsx"' +
  '});' +
  'return { text: excel.text, sheets: excel.sheetCount };' +
  '`' + '`' + '`' +
  '' +
  '2. **Extract data from Excel by file path:**' +
  '`' + '`' + '`' + 'typescript' +
  'const excel = await excelDocument.extract({' +
  '  filePath: "/data/reports/q1_financials.xlsx"' +
  '});' +
  'return excel.text;' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Supports both .xlsx and .xls formats' +
  '- Extracts data from all sheets' +
  '- Preserves row and column structure' +
  '- Use fileId for uploaded conversation files' +
  '- Use filePath for absolute system paths' +
  '- For data analysis, consider using duckdb extension for SQL queries on Excel files';

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
    const convId = globalThis.convId || '';
    const projectId = globalThis.projectId || '';
    const tenantId = globalThis.tenantId || 'default';
    const convFilesDir = getConversationFilesDir(projectId, convId, tenantId);
    filePath = path.join(convFilesDir, options.fileId);

    try {
      await fs.access(filePath);
    } catch {
      const entries = await fs.readdir(convFilesDir, { withFileTypes: true });
      const fileEntry = entries.find(e => e.name.startsWith(options.fileId!));
      if (fileEntry) {
        filePath = path.join(convFilesDir, fileEntry.name);
      }
    }
  }

  // Validate file is Excel
  if (!isExcelFile(filePath)) {
    throw new Error("File is not an Excel spreadsheet (.xlsx, .xls)");
  }

  try {
    const text = await extractTextFromExcel(filePath);
    return { text };
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

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  extract,
  read,
  extractXLSX,
  xlsxReader,
};
