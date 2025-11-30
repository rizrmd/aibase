import { PDFParse } from "pdf-parse";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * PDF reader options
 */
export interface PDFReaderOptions {
  /** PDF file path to read */
  filePath?: string;
  /** PDF buffer data (alternative to filePath) */
  buffer?: Buffer;
  /** Password for encrypted PDFs (note: pdf-parse has limited password support) */
  password?: string;
  /** Maximum number of pages to read (0 = all pages) */
  maxPages?: number;
}

/**
 * PDF page information
 */
export interface PDFPageInfo {
  pageNumber: number;
  text: string;
}

/**
 * PDF reader result
 */
export interface PDFReaderResult {
  /** Extracted text from the PDF */
  text: string;
  /** Number of pages in the PDF */
  totalPages: number;
  /** PDF metadata */
  info?: any;
  /** PDF version */
  version?: string;
}

/**
 * Create a PDF reader function that extracts text from PDF files
 *
 * Supports:
 * - Reading from file path or buffer
 * - Page extraction
 * - Metadata extraction
 *
 * @param cwd - Working directory for resolving relative file paths
 */
export function createPDFReaderFunction(cwd?: string) {
  return async (options: PDFReaderOptions): Promise<PDFReaderResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "pdfReader requires an options object. Usage: pdfReader({ filePath: 'document.pdf' })"
      );
    }

    if (!options.filePath && !options.buffer) {
      throw new Error(
        "pdfReader requires either 'filePath' or 'buffer' parameter. Usage: pdfReader({ filePath: 'document.pdf' })"
      );
    }

    try {
      let dataBuffer: Buffer;

      // Read file if filePath is provided
      if (options.filePath) {
        let filePath = options.filePath;

        // If path is absolute, use it as-is
        if (filePath.startsWith('/') || path.isAbsolute(filePath)) {
          // Use absolute path directly
        } else if (cwd) {
          // For relative paths, check if it's just a filename or includes subdirectories
          // Extract just the filename if the path seems to include the conversation directory structure
          const filename = path.basename(filePath);

          // If the relative path includes directory separators and cwd is already the files directory,
          // use just the filename to avoid duplication
          if (filePath.includes('/') && cwd.endsWith('/files')) {
            filePath = path.join(cwd, filename);
          } else {
            filePath = path.join(cwd, filePath);
          }
        }

        dataBuffer = await fs.readFile(filePath);
      } else {
        dataBuffer = options.buffer!;
      }

      // Create PDFParse instance with the buffer data
      const pdfParser = new PDFParse({
        data: dataBuffer,
        password: options.password,
      });

      // Parse options for text extraction
      const parseParams: any = {};

      if (options.maxPages && options.maxPages > 0) {
        parseParams.first = options.maxPages;
      }

      // Extract text from the PDF
      const textResult = await pdfParser.getText(parseParams);

      // Get document info
      const infoResult = await pdfParser.getInfo();

      // Clean up
      await pdfParser.destroy();

      return {
        text: textResult.text,
        totalPages: textResult.total,
        info: infoResult.info,
        version: undefined, // pdf-parse v2 doesn't expose version in the same way
      };
    } catch (error: any) {
      throw new Error(`PDF reading failed: ${error.message}`);
    }
  };
}

/**
 * Helper function to read PDF from file path
 */
export async function readPDF(
  filePath: string,
  options?: { password?: string; maxPages?: number; cwd?: string }
): Promise<PDFReaderResult> {
  return createPDFReaderFunction(options?.cwd)({
    filePath,
    password: options?.password,
    maxPages: options?.maxPages,
  });
}

/**
 * Helper function to read PDF from buffer
 */
export async function readPDFBuffer(
  buffer: Buffer,
  options?: { password?: string; maxPages?: number }
): Promise<PDFReaderResult> {
  return createPDFReaderFunction()({
    buffer,
    password: options?.password,
    maxPages: options?.maxPages,
  });
}
