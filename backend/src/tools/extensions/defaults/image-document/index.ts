/**
 * Image Document Extension
 * Extract descriptions and content from images using Z.AI Vision API
 * Also registers a hook to automatically analyze uploaded images
 *
 * Note: This extension uses only built-in Node.js/Bun modules
 * The extensionHookRegistry is passed as a parameter during evaluation
 */

// Check if extensionHookRegistry is available (passed as argument)
const hookRegistry = typeof extensionHookRegistry !== 'undefined' ? extensionHookRegistry : null;

/**
 * Context documentation for the image-document extension
 * This is exported and included in the AI's system prompt
 */
export const context = () => `
### Image Document Extension

**Available Functions:**

#### extract(options)
Extract description and analyze image content.
\`\`\`typescript
await imageDocument.extract({
  filePath: "photo.png",           // Full path to image
  fileId: "photo.png",              // Or use file ID (for uploaded files)
  prompt: "Custom prompt here"      // Optional: custom prompt for analysis
});
\`\`\`

#### extractText(options)
Extract text from image using OCR (Optical Character Recognition).
\`\`\`typescript
await imageDocument.extractText({
  filePath: "KTP.png",              // Full path to image
  fileId: "KTP.png",                // Or use file ID (for uploaded files)
  prompt: "What is the NIK number?" // Optional: custom prompt for specific info
});
\`\`\`

#### read(options)
Alias for extract() - read and analyze image.
\`\`\`typescript
await imageDocument.read({ fileId: "photo.png" });
\`\`\`

#### analyzeImage(options)
Alias for extract() - analyze image content.
\`\`\`typescript
await imageDocument.analyzeImage({ filePath: "photo.png" });
\`\`\`

**Examples:**

1. **Extract text from KTP (Indonesian ID card):**
\`\`\`typescript
const result = await imageDocument.extractText({
  fileId: "KTP MAYLATUN SARI.png",
  prompt: "What is the NIK (16-digit identification number) on this KTP card? Return only the number."
});
return { nik: result.description };
\`\`\`

2. **General image description:**
\`\`\`typescript
const desc = await imageDocument.extract({
  filePath: "photo.jpg"
});
return { description: desc.description };
\`\`\`

3. **Extract specific information with custom prompt:**
\`\`\`typescript
const info = await imageDocument.extractText({
  fileId: "document.png",
  prompt: "Extract the name, date, and amount from this document. Format as JSON."
});
return { extracted: info.description };
\`\`\`

**Important Notes:**
- Use \`extractText()\` for OCR on images with text (KTP, documents, screenshots, etc.)
- Pass the user's question as the \`prompt\` parameter for targeted results
- Use \`fileId\` for files uploaded to the conversation, \`filePath\` for full system paths
- The extension requires OPENAI_API_KEY to be configured
`;

/**
 * Check if a file is an image based on its MIME type
 */
function isImageFile(mimeType) {
  const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
  return imageMimeTypes.includes(mimeType);
}

/**
 * Analyze an image file and extract description
 */
async function analyzeImageFile(filePath, mimeType) {
  console.log('[ImageDocument] analyzeImageFile called:', { filePath, mimeType });

  // Get API key from environment
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[ImageDocument] OPENAI_API_KEY not configured, skipping image analysis');
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

  console.log('[ImageDocument] Calling vision API:', { endpoint, model: 'GLM-4.6V' });

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
      console.error('[ImageDocument] Vision API error:', response.status, errorText);
      return null;
    }

    console.log('[ImageDocument] Vision API response status:', response.status);

    const data = await response.json();
    console.log('[ImageDocument] Vision API response keys:', Object.keys(data));
    console.log('[ImageDocument] Full response structure:', JSON.stringify(data, null, 2).substring(0, 500));

    // GLM-4.6V returns reasoning in reasoning_content field
    const description = data.choices?.[0]?.message?.content ||
                       data.choices?.[0]?.message?.reasoning_content;

    console.log('[ImageDocument] Extracted description:', description ? description.substring(0, 100) : 'UNDEFINED');

    if (description) {
      console.log('[ImageDocument] Image analyzed successfully:', description.substring(0, 100));
      return description;
    }

    console.log('[ImageDocument] No description found in response, returning null');
    return null;
  } catch (error) {
    clearTimeout(timeoutId); // Ensure timeout is cleared on error
    if (error.name === 'AbortError') {
      console.error('[ImageDocument] Vision API request timed out after 30 seconds');
      return null;
    }
    console.error('[ImageDocument] Image analysis failed:', error.message);
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
  extract: async (options) => {
    if (!options || typeof options !== "object") {
      throw new Error("extractImage requires an options object");
    }

    if (!options.filePath && !options.fileId) {
      throw new Error("extractImage requires either 'filePath' or 'fileId' parameter");
    }

    let filePath = options.filePath!;

    // If fileId is provided, resolve to actual file path
    if (options.fileId) {
      const convId = (globalThis as any).convId || '';
      const projectId = (globalThis as any).projectId || '';
      const tenantId = (globalThis as any).tenantId || 'default';
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
      const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';

      // Default prompt for image description
      const defaultPrompt = options.prompt ||
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

      const data = await response.json();
      // GLM-4.6V returns reasoning in reasoning_content field
      const description = data.choices?.[0]?.message?.content ||
                         data.choices?.[0]?.message?.reasoning_content ||
                         'No description generated';

      return {
        description,
        model: data.model,
        usage: data.usage,
      };
    } catch (error) {
      throw new Error(`Image analysis failed: ${error.message}`);
    }
  },

  /**
   * Read and analyze image - alias for extract()
   */
  read: async (options) => {
    return imageDocumentExtension.extract(options);
  },

  /**
   * Extract text from image (OCR)
   * If prompt is provided in options, it will be used instead of default OCR prompt
   */
  extractText: async (options) => {
    return imageDocumentExtension.extract({
      ...options,
      prompt: options.prompt || "Extract all text visible in this image. Preserve the structure and formatting as much as possible. If there is no text, state that clearly.",
    });
  },

  /**
   * Convenience method - alias for extract()
   */
  analyzeImage: async (options) => {
    return imageDocumentExtension.extract(options);
  },
};

// Register hook for automatic image analysis on upload
if (hookRegistry) {
  hookRegistry.registerHook(
    'afterFileUpload',
    'image-document',
    async (context) => {
      // Only process image files
      if (!isImageFile(context.fileType)) {
        return;
      }

      console.log('[ImageDocument] Hook triggered for image:', context.fileName);

      // Analyze the image
      const description = await analyzeImageFile(context.filePath, context.fileType);

      console.log('[ImageDocument] analyzeImageFile returned:', description ? `success (${description.substring(0, 50)}...)` : 'null/undefined');

      if (description) {
        console.log('[ImageDocument] Generated description for:', context.fileName, description.substring(0, 100));
        return { description };
      }

      console.log('[ImageDocument] No description generated for:', context.fileName);
      return {};
    }
  );
  console.log('[ImageDocument] Registered afterFileUpload hook');
} else {
  console.log('[ImageDocument] extensionHookRegistry not available, hook not registered');
}

// Return the extension object
return imageDocumentExtension;
