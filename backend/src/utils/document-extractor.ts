/**
 * Document text extraction utilities
 * Handles extracting text from various document formats
 */

import * as fs from 'fs/promises';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { createRequire } from 'module';

// Use createRequire to load CommonJS modules in ESM
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const officeParser = require('officeparser');

/**
 * Extract text from a .docx file
 * @param filePath - Path to the .docx file
 * @returns Extracted text content
 */
export async function extractTextFromDocx(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error: any) {
    throw new Error(`Failed to extract text from .docx file: ${error.message}`);
  }
}

/**
 * Extract text from a .pdf file
 * Uses unpdf (Bun-compatible PDF.js wrapper) for text extraction
 *
 * @param filePath - Path to the .pdf file
 * @returns Extracted text content
 */
export async function extractTextFromPdf(filePath: string): Promise<string> {
  try {
    // Read the PDF file as buffer
    const buffer = await fs.readFile(filePath);

    // Convert buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);

    // Load PDF using unpdf
    const pdf = await getDocumentProxy(uint8Array);

    // Extract text from all pages, merged into single string
    const { text } = await extractText(pdf, { mergePages: true });

    // Clean up excessive whitespace
    const cleanedText = text
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .replace(/\n\s*\n/g, '\n\n')  // Multiple newlines to double newline
      .trim();

    return cleanedText;
  } catch (error: any) {
    throw new Error(`Failed to extract text from PDF file: ${error.message}`);
  }
}

/**
 * Check if a file is a .docx file
 */
export function isDocxFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.docx');
}

/**
 * Check if a file is a .pdf file
 */
export function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

/**
 * Check if a file is an Excel file (.xlsx, .xls)
 */
export function isExcelFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
}

/**
 * Check if a file is a PowerPoint file (.pptx, .ppt)
 */
export function isPowerPointFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt');
}

/**
 * Extract text from an Excel file (.xlsx, .xls)
 * @param filePath - Path to the Excel file
 * @returns Extracted text content from all cells
 */
export async function extractTextFromExcel(filePath: string): Promise<string> {
  try {
    // Read the Excel file as buffer
    const buffer = await fs.readFile(filePath);

    // Parse the workbook
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Extract text from all sheets
    const allText: string[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];

      // Convert sheet to JSON with header: 1 to get array of arrays
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Add sheet name as header
      allText.push(`\n=== Sheet: ${sheetName} ===`);

      // Extract text from each row
      data.forEach((row: any) => {
        if (Array.isArray(row) && row.length > 0) {
          // Filter out empty cells and join with tab
          const rowText = row
            .filter((cell: any) => cell !== undefined && cell !== null && cell !== '')
            .map((cell: any) => String(cell))
            .join(' | ');
          if (rowText.trim()) {
            allText.push(rowText);
          }
        }
      });
    });

    return allText.join('\n').trim();
  } catch (error: any) {
    throw new Error(`Failed to extract text from Excel file: ${error.message}`);
  }
}

/**
 * Extract text from a PowerPoint file (.pptx)
 * @param filePath - Path to the PowerPoint file
 * @returns Extracted text content from all slides
 */
export async function extractTextFromPowerPoint(filePath: string): Promise<string> {
  try {
    // Use officeparser to extract text from PowerPoint
    const result = await officeParser.parseOffice(filePath);

    // officeparser returns structured data, extract text from it
    if (typeof result === 'string') {
      return result;
    } else if (result && typeof result === 'object') {
      // Try to extract text from structured result
      if (result.text) {
        return result.text;
      } else if (result.data && Array.isArray(result.data)) {
        // Join all data/text elements
        return result.data
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && item.text) return item.text;
            return '';
          })
          .filter(Boolean)
          .join('\n');
      } else if (result.slides && Array.isArray(result.slides)) {
        // Extract from slides array
        return result.slides
          .map((slide: any, index: number) => {
            const slideText = typeof slide === 'string' ? slide : (slide.text || JSON.stringify(slide));
            return `=== Slide ${index + 1} ===\n${slideText}`;
          })
          .join('\n\n');
      }
    }

    // Fallback: stringify the result
    return JSON.stringify(result, null, 2);
  } catch (error: any) {
    throw new Error(`Failed to extract text from PowerPoint file: ${error.message}`);
  }
}

/**
 * Extract text from a file based on its extension
 * @param filePath - Path to the file
 * @param fileName - Name of the file (used to detect type)
 * @returns Extracted text content
 */
export async function extractTextFromFile(filePath: string, fileName: string): Promise<string> {
  if (isDocxFile(fileName)) {
    return await extractTextFromDocx(filePath);
  }

  if (isPdfFile(fileName)) {
    return await extractTextFromPdf(filePath);
  }

  if (isExcelFile(fileName)) {
    return await extractTextFromExcel(filePath);
  }

  if (isPowerPointFile(fileName)) {
    return await extractTextFromPowerPoint(filePath);
  }

  // For other files, just read as text
  return await fs.readFile(filePath, 'utf-8');
}
