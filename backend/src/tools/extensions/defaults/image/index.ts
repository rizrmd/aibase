/**
 * Image Document Extension
 * Extract descriptions and content from images using Z.AI Vision API
 * Also registers a hook to automatically analyze uploaded images
 *
 * Note: This extension uses only built-in Node.js/Bun modules
 * The extensionHookRegistry is passed as a parameter during evaluation
 */

// Type definitions
interface ExtensionHookRegistry {
  registerHook(hookType: string, name: string, handler: (context: HookContext) => Promise<HookResult | undefined>): void;
}

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

declare const extensionHookRegistry: ExtensionHookRegistry | undefined;
declare const utils: ExtensionUtils;

interface HookContext {
  fileName: string;
  filePath: string;
  fileType: string;
  fileId?: string;
}

interface HookResult {
  description?: string;
  [key: string]: unknown;
}

interface ExtractOptions {
  filePath?: string;
  fileId?: string;
  prompt?: string;
}

interface VisionAPIResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// Extend globalThis for extension context
declare global {
  var convId: string | undefined;
  var projectId: string | undefined;
  var tenantId: string | undefined;
}

// Check if extensionHookRegistry is available (passed as argument)
declare const extensionHookRegistry: ExtensionHookRegistry | undefined;
const hookRegistry = typeof extensionHookRegistry !== 'undefined' ? extensionHookRegistry : null;

/**
 * Context documentation for the image extension
 * This is exported and included in the AI's system prompt
 */
const context = () =>
  '### Image Extension\n\n' +
  '**Available Functions:**\n\n' +
  '#### extract(options)\n' +
  'Extract description and analyze image content.\n' +
  '```typescript\n' +
  'await image.extract({\n' +
  '  filePath: "photo.png",           // Full path to image\n' +
  '  fileId: "photo.png",              // Or use file ID (for uploaded files)\n' +
  '  prompt: "Custom prompt here"      // Optional: custom prompt for analysis\n' +
  '});\n' +
  '```\n\n' +
  '#### read(options)\n' +
  'Alias for extract() - read and analyze image.\n' +
  '```typescript\n' +
  'await image.read({ fileId: "photo.png" });\n' +
  '```\n\n' +
  '#### analyzeImage(options)\n' +
  'Alias for extract() - analyze image content.\n' +
  '```typescript\n' +
  'await image.analyzeImage({ filePath: "photo.png" });\n' +
  '```\n\n' +
  '**Examples:**\n\n' +
  '1. **General image description:**\n' +
  '```typescript\n' +
  'const desc = await image.extract({\n' +
  '  filePath: "photo.jpg"\n' +
  '});\n' +
  'return { description: desc.description };\n' +
  '```\n\n' +
  '2. **Extract specific information with custom prompt:**\n' +
  '```typescript\n' +
  'const info = await image.extract({\n' +
  '  fileId: "document.png",\n' +
  '  prompt: "Describe the colors, objects, and composition in this image."\n' +
  '});\n' +
  'return { analyzed: info.description };\n' +
  '```\n\n' +
  '**Important Notes:**\n' +
  '- Use `extract()` to analyze images with AI vision\n' +
  '- Pass the user\'s question as the `prompt` parameter for targeted results\n' +
  '- Use `fileId` for files uploaded to the conversation, `filePath` for full system paths\n' +
  '- The extension requires OPENAI_API_KEY to be configured\n';

/**
 * Check if a file is an image based on its MIME type
 */
function isImageFile(mimeType: string) {
  const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
  return imageMimeTypes.includes(mimeType);
}

/**
 * Analyze an image file and extract description
 */
async function analyzeImageFile(filePath: string, mimeType: string) {
  console.log('[Image] analyzeImageFile called:', { filePath, mimeType });

  // Get API key from environment
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[Image] OPENAI_API_KEY not configured, skipping image analysis');
    return null;
  }

  // Read image file and convert to base64
  const imageBuffer = await Bun.file(filePath).arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');

  // Default prompt for image description
  const defaultPrompt = "Describe this image in detail, including the main subjects, colors, composition, mood, and any text visible in the image.";

  // Use OPENAI_BASE_URL from environment or default to Z.AI Vision API
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.z.ai/v1';
  const endpoint = `${baseUrl}/chat/completions`;

  console.log('[Image] Calling vision API:', { endpoint, model: 'GLM-4.6V' });

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 30 second timeout

  try {
    // Call Z.AI Vision API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'GLM-4.6V',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: defaultPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Image] Vision API error:', response.status, errorText);
      return null;
    }

    console.log('[Image] Vision API response status:', response.status);

    const data = await response.json() as VisionAPIResponse;
    console.log('[Image] Vision API response keys:', Object.keys(data));
    console.log('[Image] Full response structure:', JSON.stringify(data, null, 2).substring(0, 500));

    // GLM-4.6V returns reasoning in reasoning_content field
    const description = data.choices?.[0]?.message?.content ||
                       data.choices?.[0]?.message?.reasoning_content;

    console.log('[Image] Extracted description:', description ? description.substring(0, 100) : 'UNDEFINED');

    if (description) {
      console.log('[Image] Image analyzed successfully:', description.substring(0, 100));
      return description;
    }

    console.log('[Image] No description found in response, returning null');
    return null;
  } catch (error: unknown) {
    clearTimeout(timeoutId); // Ensure timeout is cleared on error
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Image] Vision API request timed out after 30 seconds');
      return null;
    }
    console.error('[Image] Image analysis failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Image Document extension
 * Extract descriptions and analyze images using AI vision
 */
const imageDocumentExtension = {
  /**
   * Analyze image and extract description
   */
  extract: async (options: ExtractOptions) => {
    if (!options || typeof options !== "object") {
      throw new Error("extractImage requires an options object");
    }

    if (!options.filePath && !options.fileId) {
      throw new Error("extractImage requires either 'filePath' or 'fileId' parameter");
    }

    let filePath: string;
    if (options.filePath) {
      filePath = options.filePath;
    } else {
      filePath = '';
    }

    // If fileId is provided, resolve to actual file path
    if (options.fileId) {
      const convId = globalThis.convId || '';
      const projectId = globalThis.projectId || '';
      const tenantId = globalThis.tenantId || 'default';
      const convFilesDir = `data/projects/${tenantId}/${projectId}/conversations/${convId}/files`;
      filePath = `${convFilesDir}/${options.fileId}`;

      try {
        await Bun.file(filePath).arrayBuffer();
      } catch {
        // List files to find match
        const dir = await import('fs/promises');
        const entries = await dir.readdir(convFilesDir, { withFileTypes: true });
        const fileEntry = entries.find(e => e.name.startsWith(options.fileId!));
        if (fileEntry) {
          filePath = `${convFilesDir}/${fileEntry.name}`;
        }
      }
    }

    // Get API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required for image analysis");
    }

    try {
      // Read image file and convert to base64
      const imageBuffer = await Bun.file(filePath).arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');

      // Detect MIME type
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
      };
      const mimeType = mimeTypes[ext as keyof typeof mimeTypes] || 'image/jpeg';

      // Default prompt for image description
      const defaultPrompt = options.prompt ??
        "Describe this image in detail, including the main subjects, colors, composition, mood, and any text visible in the image.";

      // Use OPENAI_BASE_URL from environment or default to Z.AI API
      const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.z.ai/v1';
      const endpoint = `${baseUrl}/chat/completions`;

      // Call Z.AI Vision API
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4v',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: defaultPrompt,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vision API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as VisionAPIResponse;
      // GLM-4.6V returns reasoning in reasoning_content field
      const description = data.choices?.[0]?.message?.content ??
                         data.choices?.[0]?.message?.reasoning_content ??
                         'No description generated';

      return {
        description,
        model: data.model,
        usage: data.usage,
      };
    } catch (error: unknown) {
      throw new Error(`Image analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Read and analyze image - alias for extract()
   */
  read: async (options: ExtractOptions) => {
    return imageDocumentExtension.extract(options);
  },

  /**
   * Convenience method - alias for extract()
   */
  analyzeImage: async (options: ExtractOptions) => {
    return imageDocumentExtension.extract(options);
  },
};

// Register hook for automatic image analysis on upload
if (hookRegistry) {
  hookRegistry.registerHook(
    'afterFileUpload',
    'image-document',
    async (_context: HookContext) => {
      // Only process image files
      if (!isImageFile(_context.fileType)) {
        return;
      }

      console.log('[Image] Hook triggered for image:', _context.fileName);

      // Analyze the image
      const description = await analyzeImageFile(_context.filePath, _context.fileType);

      console.log('[Image] analyzeImageFile returned:', description ? `success (${description.substring(0, 50)}...)` : 'null/undefined');

      if (description) {
        console.log('[Image] Generated description for:', _context.fileName, description.substring(0, 100));

        // Generate title using AI helper (injected utility)
        const title = await utils.generateTitle({
          systemPrompt: "Generate a concise 3-8 word title for an image based on its description. Return only the title, no quotes.",
          content: `File: ${_context.fileName}\n\nImage description:\n${description.substring(0, 500)}`,
          label: "Image",
        });

        return { description, title };
      }

      console.log('[Image] No description generated for:', _context.fileName);
      return {};
    }
  );
  console.log('[Image] Registered afterFileUpload hook');
} else {
  console.log('[Image] extensionHookRegistry not available, hook not registered');
}

// Return the extension object (extension loader wraps this in an async function)
// @ts-expect-error - Extension loader wraps this code in an async function
return imageDocumentExtension;

