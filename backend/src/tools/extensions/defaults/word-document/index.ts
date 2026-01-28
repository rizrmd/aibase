/**
 * Word Document Extension
 * Extract text content from Word documents (.docx)
 * Enhanced version of extract-docx with additional capabilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { extractTextFromDocx, isDocxFile } from '../../../../utils/document-extractor';
import { getConversationFilesDir } from '../../../../config/paths';

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
 * Context documentation for the Word Document extension
 */
const context = () =>
  '' +
  '### Word Document Extension' +
  '' +
  'Extract text content from Word documents (.docx).' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### extract(options)' +
  'Extract text from Word document.' +
  '`' + '`' + '`' + 'typescript' +
  'await wordDocument.extract({' +
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
  'const doc = await wordDocument.extract({' +
  '  fileId: "contract.docx"' +
  '});' +
  'return { text: doc.text, paragraphs: doc.paragraphCount };' +
  '`' + '`' + '`' +
  '' +
  '2. **Extract text from Word document by file path:**' +
  '`' + '`' + '`' + 'typescript' +
  'const doc = await wordDocument.extract({' +
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

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  extract,
  read,
  extractDOCX,
  docxReader,
};
