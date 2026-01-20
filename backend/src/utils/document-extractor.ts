/**
 * Document text extraction utilities
 * Handles extracting text from various document formats
 */

import * as fs from 'fs/promises';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

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

  // For other files, just read as text
  return await fs.readFile(filePath, 'utf-8');
}
