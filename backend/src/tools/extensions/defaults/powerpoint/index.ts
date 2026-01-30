/**
 * PowerPoint Document Extension
 * Extract text content from PowerPoint presentations (.pptx, .ppt)
 * Enhanced version of extract-pptx with additional capabilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { extractTextFromPowerPoint, isPowerPointFile } from '../../../../utils/document-extractor';
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
 * Context documentation for the PowerPoint extension
 */
const context = () =>
  '' +
  '### PowerPoint Extension' +
  '' +
  'Extract text content from PowerPoint presentations (.pptx, .ppt).' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### extract(options)' +
  'Extract text from PowerPoint presentation.' +
  '`' + '`' + '`' + 'typescript' +
  'await powerpoint.extract({' +
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
  'const ppt = await powerpoint.extract({' +
  '  fileId: "presentation.pptx"' +
  '});' +
  'return { text: ppt.text, slides: ppt.slideCount };' +
  '`' + '`' + '`' +
  '' +
  '2. **Extract text from PowerPoint by file path:**' +
  '`' + '`' + '`' + 'typescript' +
  'const ppt = await powerpoint.extract({' +
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

// Hook registry is passed as global during evaluation
interface ExtensionHookRegistry {
  registerHook(hookType: string, name: string, handler: (context: any) => Promise<any>): void;
}

declare const extensionHookRegistry: ExtensionHookRegistry | undefined;
const hookRegistry = typeof extensionHookRegistry !== 'undefined' ? extensionHookRegistry : null;

// Register hook for automatic PowerPoint analysis on upload
if (hookRegistry) {
  hookRegistry.registerHook(
    'afterFileUpload',
    'powerpoint',
    async (_context: any) => {
      console.log('[PowerPointDocument] Hook called for file:', _context.fileName, 'type:', _context.fileType);

      // Only process PowerPoint files
      if (!_context.fileType.match(/(^application\/(vnd\.openxmlformats-officedocument\.presentationml\.presentation|vnd\.ms-powerpoint))|\.ppt|\.pptx)/i)) {
        console.log('[PowerPointDocument] Skipping non-PowerPoint file');
        return;
      }

      console.log('[PowerPointDocument] Processing PowerPoint file:', _context.fileName);

      try {
        // Extract text content from PowerPoint
        console.log('[PowerPointDocument] Extracting text from:', _context.filePath);
        const text = await extractTextFromPowerPoint(_context.filePath);

        // Generate structured description for AI
        const preview = text.substring(0, 500);
        const lineCount = text.split('\n').length;

        const description = `PowerPoint Presentation: ${_context.fileName}

Content Preview (first 500 chars):
${preview}

Full Text Length: ${text.length} characters
Total Lines: ${lineCount}

Slide count can be determined by structure analysis if needed.`;

        // Generate title using AI helper (injected utility)
        const title = await utils.generateTitle({
          systemPrompt: "Generate a concise 3-8 word title for a PowerPoint presentation based on its content. Return only the title, no quotes.",
          content: `File: ${_context.fileName}\n\nFirst 500 characters of content:\n${preview}`,
          label: "PowerPointDocument",
        });

        console.log('[PowerPointDocument] Generated description for:', _context.fileName, 'text length:', text.length);

        return { description, title };
      } catch (error) {
        console.error('[PowerPointDocument] Hook failed:', error);
        console.error('[PowerPointDocument] Error stack:', error instanceof Error ? error.stack : String(error));
        return {};
      }
    }
  );
  console.log('[PowerPointDocument] Registered afterFileUpload hook');
} else {
  console.log('[PowerPointDocument] extensionHookRegistry not available, hook not registered');
}

// @ts-expect-error - Extension loader wraps this code in an async function
return {
  extract,
  read,
  extractPPTX,
  pptxReader,
};
