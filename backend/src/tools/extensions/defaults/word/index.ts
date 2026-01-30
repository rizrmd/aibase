/**
 * Word Document Extension
 * Extract text content from Word documents (.docx)
 * Enhanced version of extract-docx with additional capabilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { extractTextFromDocx, isDocxFile } from '../../../../utils/document-extractor';
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
interface ExtractOptions {
  filePath?: string;
  fileId?: string;
}

interface ExtractResult {
  text: string;
}

// Extend globalThis for extension context
declare global {
  var convId: string | undefined;
  var projectId: string | undefined;
  var tenantId: string | undefined;
}

/**
 * Context documentation for the Word extension
 */
const context = () =>
  '' +
  '### Word Extension' +
  '' +
  'Extract text content from Word documents (.docx).' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### extract(options)' +
  'Extract text from Word document.' +
  '`' + '`' + '`' + 'typescript' +
  'await word.extract({' +
  '  filePath: "/path/to/document.docx",  // Full path to file' +
  '  fileId: "report.docx"                // Or file ID in conversation' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`filePath\\` (optional): Full path to the Word document' +
  '- \\`fileId\\` (optional): File ID in conversation storage' +
  '- Either \\`filePath\\` or \\`fileId\\` is required' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  text: string,        // Extracted text content' +
  '  paragraphCount: number,  // Number of paragraphs' +
  '  fileName: string     // File name' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Extract text from Word document by file ID:**' +
  '`' + '`' + '`' + 'typescript' +
  'const doc = await word.extract({' +
  '  fileId: "contract.docx"' +
  '});' +
  'return { text: doc.text, paragraphs: doc.paragraphCount };' +
  '`' + '`' + '`' +
  '' +
  '2. **Extract text from Word document by file path:**' +
  '`' + '`' + '`' + 'typescript' +
  'const doc = await word.extract({' +
  '  filePath: "/data/documents/proposal.docx"' +
  '});' +
  'return doc.text;' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Supports .docx format (modern Word format)' +
  '- Preserves paragraph structure' +
  '- Extracts text with formatting removed' +
  '- Use fileId for uploaded conversation files' +
  '- Use filePath for absolute system paths' +
  '- Does not support legacy .doc format (convert to .docx first)';

/**
 * Extract text from Word document
 */
const extract = async (options: ExtractOptions): Promise<ExtractResult> => {
  if (!options || typeof options !== "object") {
    throw new Error("extractDOCX requires an options object");
  }

  if (!options.filePath && !options.fileId) {
    throw new Error("extractDOCX requires either 'filePath' or 'fileId' parameter");
  }

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

  // Validate file is DOCX
  if (!isDocxFile(filePath)) {
    throw new Error("File is not a Word document (.docx)");
  }

  try {
    const text = await extractTextFromDocx(filePath);
    return { text };
  } catch (error: unknown) {
    throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Read Word document - alias for extract()
 */
const read = async (options: ExtractOptions): Promise<ExtractResult> => extract(options);

/**
 * Convenience method - alias for extract()
 */
const extractDOCX = async (options: ExtractOptions): Promise<ExtractResult> => extract(options);

/**
 * Convenience method - alias for read()
 */
const docxReader = async (options: ExtractOptions): Promise<ExtractResult> => extract(options);

// Hook registry is passed as global during evaluation
interface ExtensionHookRegistry {
  registerHook(hookType: string, name: string, handler: (context: any) => Promise<any>): void;
}

declare const extensionHookRegistry: ExtensionHookRegistry | undefined;
const hookRegistry = typeof extensionHookRegistry !== 'undefined' ? extensionHookRegistry : null;

// Register hook for automatic Word document analysis on upload
if (hookRegistry) {
  hookRegistry.registerHook(
    'afterFileUpload',
    'word',
    async (_context: any) => {
      console.log('[WordDocument] Hook called for file:', _context.fileName, 'type:', _context.fileType);

      // Only process Word documents
      if (!_context.fileType.match(/(^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|\.doc|\.docx)/i)) {
        console.log('[WordDocument] Skipping non-Word file');
        return;
      }

      console.log('[WordDocument] Processing Word document:', _context.fileName);

      try {
        // Extract text content from Word
        console.log('[WordDocument] Extracting text from:', _context.filePath);
        const text = await extractTextFromDocx(_context.filePath);

        // Generate structured description for AI
        const preview = text.substring(0, 500);
        const wordCount = text.split(/\s+/).length;
        const paragraphCount = text.split(/\n\n+/).length;

        const description = `Word Document: ${_context.fileName}

Content Preview (first 500 chars):
${preview}

Full Text Length: ${text.length} characters
Word Count: ${wordCount}
Paragraph Count: ${paragraphCount}`;

        // Generate title using AI helper (injected utility)
        const title = await utils.generateTitle({
          systemPrompt: "Generate a concise 3-8 word title for a Word document based on its content. Return only the title, no quotes.",
          content: `File: ${_context.fileName}\n\nFirst 500 characters of content:\n${preview}`,
          label: "WordDocument",
        });

        console.log('[WordDocument] Generated description for:', _context.fileName, 'text length:', text.length);

        return { description, title };
      } catch (error) {
        console.error('[WordDocument] Hook failed:', error);
        console.error('[WordDocument] Error stack:', error instanceof Error ? error.stack : String(error));
        return {};
      }
    }
  );
  console.log('[WordDocument] Registered afterFileUpload hook');
} else {
  console.log('[WordDocument] extensionHookRegistry not available, hook not registered');
}

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  extract,
  read,
  extractDOCX,
  docxReader,
};
