/**
 * PowerPoint Document Extension
 * Extract text content from PowerPoint presentations (.pptx, .ppt)
 * Enhanced version of extract-pptx with additional capabilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { extractTextFromPowerPoint, isPowerPointFile } from '../../../../utils/document-extractor';
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
 * Context documentation for the PowerPoint Document extension
 */
const context = () =>
  '' +
  '### PowerPoint Document Extension' +
  '' +
  'Extract text content from PowerPoint presentations (.pptx, .ppt).' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### extract(options)' +
  'Extract text from PowerPoint presentation.' +
  '`' + '`' + '`' + 'typescript' +
  'await powerpointDocument.extract({' +
  '  filePath: "/path/to/presentation.pptx",  // Full path to file' +
  '  fileId: "slides.pptx"                   // Or file ID in conversation' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`filePath\\` (optional): Full path to the PowerPoint file' +
  '- \\`fileId\\` (optional): File ID in conversation storage' +
  '- Either \\`filePath\\` or \\`fileId\\` is required' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  text: string,         // Extracted text content from all slides' +
  '  slideCount: number,   // Number of slides in presentation' +
  '  fileName: string      // File name' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Extract text from PowerPoint by file ID:**' +
  '`' + '`' + '`' + 'typescript' +
  'const ppt = await powerpointDocument.extract({' +
  '  fileId: "presentation.pptx"' +
  '});' +
  'return { text: ppt.text, slides: ppt.slideCount };' +
  '`' + '`' + '`' +
  '' +
  '2. **Extract text from PowerPoint by file path:**' +
  '`' + '`' + '`' + 'typescript' +
  'const ppt = await powerpointDocument.extract({' +
  '  filePath: "/data/presentations/q1_review.pptx"' +
  '});' +
  'return ppt.text;' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Supports .pptx (modern format) and .ppt (legacy format)' +
  '- Extracts text from all slides' +
  '- Preserves slide order' +
  '- Use fileId for uploaded conversation files' +
  '- Use filePath for absolute system paths';

/**
 * Extract text from PowerPoint presentation
 */
const extract = async (options: ExtractOptions): Promise<ExtractResult> => {
  if (!options || typeof options !== "object") {
    throw new Error("extractPowerPoint requires an options object");
  }

  if (!options.filePath && !options.fileId) {
    throw new Error("extractPowerPoint requires either 'filePath' or 'fileId' parameter");
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

  // Validate file is PowerPoint
  if (!isPowerPointFile(filePath)) {
    throw new Error("File is not a PowerPoint presentation (.pptx, .ppt)");
  }

  try {
    const text = await extractTextFromPowerPoint(filePath);
    return { text };
  } catch (error: unknown) {
    throw new Error(`PowerPoint extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Read PowerPoint presentation - alias for extract()
 */
const read = async (options: ExtractOptions): Promise<ExtractResult> => extract(options);

/**
 * Convenience method - alias for extract()
 */
const extractPPTX = async (options: ExtractOptions): Promise<ExtractResult> => extract(options);

/**
 * Convenience method - alias for read()
 */
const pptxReader = async (options: ExtractOptions): Promise<ExtractResult> => extract(options);

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  extract,
  read,
  extractPPTX,
  pptxReader,
};
