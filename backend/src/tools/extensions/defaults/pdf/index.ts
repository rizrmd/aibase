/**
 * PDF Document Extension
 * Extract text content from PDF files with multiple methods
 * Combines functionality from extract-pdf and pdf-reader
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { extractTextFromPdf, isPdfFile } from '../../../../utils/document-extractor';
import { getProjectFilesDir } from '../../../../config/paths';

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

// Type definitions
interface ExtractPDFOptions {
  filePath?: string;
  fileId?: string;
}

interface ReadPDFOptions {
  filePath?: string;
  fileId?: string;
  buffer?: Buffer;
  password?: string;
  maxPages?: number;
}

interface ExtractPDFResult {
  text: string;
}

interface ReadPDFResult {
  text: string;
  totalPages: number;
}

// Extend globalThis for extension context
declare global {
  var convId: string | undefined;
  var projectId: string | undefined;
  var tenantId: string | undefined;
}

/**
 * Context documentation for the PDF extension
 */
const context = () =>
  '' +
  '### PDF Extension' +
  '' +
  'Extract text content from PDF files.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### extract(options)' +
  'Extract text from PDF file.' +
  '`' + '`' + '`' + 'typescript' +
  'await pdf.extract({' +
  '  filePath: "/path/to/document.pdf",  // Full path to file' +
  '  fileId: "document.pdf"              // Or file ID in conversation' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`filePath\\` (optional): Full path to the PDF file' +
  '- \\`fileId\\` (optional): File ID in conversation storage' +
  '- Either \\`filePath\\` or \\`fileId\\` is required' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  text: string,        // Extracted text content' +
  '  pageCount: number,   // Number of pages in PDF' +
  '  fileName: string     // File name' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Extract text from PDF by file ID:**' +
  '`' + '`' + '`' + 'typescript' +
  'const pdf = await pdf.extract({' +
  '  fileId: "report.pdf"' +
  '});' +
  'return { text: pdf.text, pages: pdf.pageCount };' +
  '`' + '`' + '`' +
  '' +
  '2. **Extract text from PDF by file path:**' +
  '`' + '`' + '`' + 'typescript' +
  'const pdf = await pdf.extract({' +
  '  filePath: "/data/documents/contract.pdf"' +
  '});' +
  'return pdf.text;' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Works with password-protected PDFs' +
  '- Extracts text from all pages' +
  '- Preserves document structure' +
  '- Use fileId for uploaded conversation files' +
  '- Use filePath for absolute system paths';

/**
 * Extract text from PDF file using pdf-parse library
 * Best for most PDFs with good text extraction accuracy
 */
const extract = async (options: ExtractPDFOptions): Promise<ExtractPDFResult> => {
  if (!options || typeof options !== "object") {
    throw new Error("extractPDF requires an options object");
  }

  if (!options.filePath && !options.fileId) {
    throw new Error("extractPDF requires either 'filePath' or 'fileId' parameter");
  }

  let filePath = options.filePath!;

  // If fileId is provided, resolve to actual file path
  if (options.fileId) {
    // Access conversation files from storage
    
    const projectId = globalThis.projectId || '';
    const tenantId = globalThis.tenantId || 'default';
    const convFilesDir = getProjectFilesDir(projectId, tenantId);
    filePath = path.join(convFilesDir, options.fileId);

    // Try to find file by ID if not directly accessible
    try {
      await fs.access(filePath);
    } catch {
      // If direct access fails, search for the file
      const entries = await fs.readdir(convFilesDir, { withFileTypes: true });
      const fileEntry = entries.find(e => e.name.startsWith(options.fileId!));
      if (fileEntry) {
        filePath = path.join(convFilesDir, fileEntry.name);
      }
    }
  }

  // Validate file is PDF
  if (!isPdfFile(filePath)) {
    throw new Error("File is not a PDF document");
  }

  try {
    const text = await extractTextFromPdf(filePath);
    return { text };
  } catch (error: unknown) {
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Read PDF file using unpdf library
 * Alternative extraction method that handles some PDFs better
 */
const read = async (options: ReadPDFOptions): Promise<ReadPDFResult> => {
  if (!options || typeof options !== "object") {
    throw new Error(
      "read requires an options object. Usage: await read({ filePath: 'document.pdf' })"
    );
  }

  if (!options.filePath && !options.buffer && !options.fileId) {
    throw new Error(
      "read requires either 'filePath', 'fileId', or 'buffer' parameter"
    );
  }

  try {
    let dataBuffer: Buffer;

    if (options.buffer) {
      dataBuffer = options.buffer;
    } else {
      let filePath = options.filePath!;

      // If fileId is provided, resolve to actual file path
      if (options.fileId) {
        
        const projectId = globalThis.projectId || '';
        const tenantId = globalThis.tenantId || 'default';
        const convFilesDir = getProjectFilesDir(projectId, tenantId);
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

      // Validate file is PDF
      if (!isPdfFile(filePath)) {
        throw new Error("File is not a PDF document");
      }

      dataBuffer = await fs.readFile(filePath);
    }

    // Use unpdf to extract text from PDF
    const { extractText, getDocumentProxy } = await import("unpdf");

    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(dataBuffer);

    // Load PDF
    const pdf = await getDocumentProxy(uint8Array);

    // Extract text (merge all pages)
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    // Clean up whitespace
    const cleanedText = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    return {
      text: cleanedText,
      totalPages: totalPages,
    };
  } catch (error: unknown) {
    throw new Error(`PDF reading failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Convenience method - alias for extract()
 */
const extractPDF = async (options: ExtractPDFOptions): Promise<ExtractPDFResult> => extract(options);

/**
 * Convenience method - alias for read()
 */
const pdfReader = async (options: ReadPDFOptions): Promise<ReadPDFResult> => read(options);

// Hook registry is passed as global during evaluation (like image-document extension)
interface ExtensionHookRegistry {
  registerHook(hookType: string, name: string, handler: (context: any) => Promise<any>): void;
}

declare const extensionHookRegistry: ExtensionHookRegistry | undefined;
const hookRegistry = typeof extensionHookRegistry !== 'undefined' ? extensionHookRegistry : null;

// Register hook for automatic PDF analysis on upload
if (hookRegistry) {
  hookRegistry.registerHook(
    'afterFileUpload',
    'pdf',
    async (_context: any) => {
      console.log('[PdfDocument] Hook called for file:', _context.fileName, 'type:', _context.fileType);

      // Only process PDF files
      if (!_context.fileType.match(/(^application\/pdf)|\.pdf$/i)) {
        console.log('[PdfDocument] Skipping non-PDF file');
        return;
      }

      console.log('[PdfDocument] Processing PDF file:', _context.fileName);

      try {
        // Extract text content from PDF
        console.log('[PdfDocument] Extracting text from:', _context.filePath);
        const text = await extractTextFromPdf(_context.filePath);

        // Calculate page count
        let pageCount = 0;
        const pdfjsLib = await import('pdfjs-dist');
        const pdfjs = await pdfjsLib.getDocument(_context.filePath);
        pageCount = pdfjs.numPages;
        await pdfjs.destroy();

        // Generate structured description for AI
        const preview = text.substring(0, 500);
        const description = `PDF Document: ${_context.fileName}

Page Count: ${pageCount}

Text Preview (first 500 chars):
${preview}

Full Text Length: ${text.length} characters`;

        // Generate title using AI helper (injected utility)
        const title = await utils.generateTitle({
          systemPrompt: "Generate a concise 3-8 word title for a PDF document based on its content. Return only the title, no quotes.",
          content: `File: ${_context.fileName}\n\nFirst 500 characters of content:\n${preview}`,
          label: "PdfDocument",
        });

        console.log('[PdfDocument] Generated description for:', _context.fileName, 'text length:', text.length);

        return { description, title };
      } catch (error) {
        console.error('[PdfDocument] Hook failed:', error);
        console.error('[PdfDocument] Error stack:', error instanceof Error ? error.stack : String(error));
        return {};
      }
    }
  );
  console.log('[PdfDocument] Registered afterFileUpload hook');
} else {
  console.log('[PdfDocument] extensionHookRegistry not available, hook not registered');
}

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  extract,
  read,
  extractPDF,
  pdfReader,
};
