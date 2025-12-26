import * as fs from "fs/promises";
import * as path from "path";

/**
 * Context documentation for PDF reader functionality
 */
export const context = async () => {
  return `### PDF READER

Use pdfReader() to extract text from PDF files.

**Available:** pdfReader({ filePath?, buffer?, password?, maxPages? })

**IMPORTANT:** When using pdfReader with files from \`file({ action: 'list' })\`, use ONLY the filename (pdf.name), NOT the full path (pdf.path)!

#### EXAMPLES

\`\`\`typescript
// Read entire PDF
progress('Reading PDF...');
const pdf = await pdfReader({ filePath: 'document.pdf' });
progress(\`Extracted \${pdf.totalPages} pages\`);
return { text: pdf.text, pages: pdf.totalPages, preview: pdf.text.substring(0, 500) + '...' };

// Read password-protected PDF
progress('Opening encrypted PDF...');
const secure = await pdfReader({ filePath: 'secure.pdf', password: 'secret123' });
return { text: secure.text, pages: secure.totalPages };

// Preview first 3 pages
progress('Reading preview...');
const preview = await pdfReader({ filePath: 'report.pdf', maxPages: 3 });
return { preview: preview.text, pagesRead: preview.totalPages };

// Batch process all PDFs
const files = await file({ action: 'list' });
const pdfs = files.filter(f => f.name.endsWith('.pdf'));
const results = [];
for (const pdf of pdfs) {
  progress(\`Processing \${pdf.name}\`);
  const content = await pdfReader({ filePath: pdf.name });
  results.push({ file: pdf.name, pages: content.totalPages, textLength: content.text.length, preview: content.text.substring(0, 200) });
}
return { processed: results.length, results };
\`\`\``
};

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

      // Dynamically import pdf-parse to avoid loading pdfjs-dist at startup
      const { PDFParse } = await import("pdf-parse");

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
