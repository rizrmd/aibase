/**
 * Extension Generator Handler
 * API endpoint for AI-powered extension creation
 */

import { ExtensionStorage } from "../storage/extension-storage";
import { generateExtension } from "../services/extension-generator";

export async function handleExtensionGeneratorRequest(req: Request, projectId: string): Promise<Response> {
  try {
    const body = await req.json();
    const { prompt, category } = body;

    // Validate input
    if (!prompt || typeof prompt !== 'string') {
      return Response.json({
        success: false,
        error: 'Prompt is required and must be a string'
      }, { status: 400 });
    }

    if (!projectId || typeof projectId !== 'string') {
      return Response.json({
        success: false,
        error: 'Project ID is required'
      }, { status: 400 });
    }

    console.log(`[ExtensionGenerator] Generating extension for project ${projectId}`);
    console.log(`[ExtensionGenerator] Prompt: ${prompt.substring(0, 100)}...`);

    // Generate extension using AI
    const extension = await generateExtension(prompt, {
      projectId,
      category: category || '',
    });

    // Save extension to project
    const extensionStorage = new ExtensionStorage();

    // Check if extension already exists
    const existing = await extensionStorage.getById(projectId, extension.metadata.id);
    if (existing) {
      return Response.json({
        success: false,
        error: `Extension with ID '${extension.metadata.id}' already exists`,
        existing: existing
      }, { status: 409 });
    }

    // Create extension
    const created = await extensionStorage.create(projectId, {
      id: extension.metadata.id,
      name: extension.metadata.name,
      description: extension.metadata.description,
      author: extension.metadata.author || 'AI Generated',
      version: extension.metadata.version || '1.0.0',
      category: extension.metadata.category,
      code: extension.code,
      enabled: true,
      isDefault: false,
    });

    console.log(`[ExtensionGenerator] Extension created: ${created.metadata.id}`);

    return Response.json({
      success: true,
      data: {
        extension: {
          metadata: created.metadata,
          // Don't return code in response (too large)
        }
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('[ExtensionGenerator] Error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Failed to generate extension',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

/**
 * Preview extension without saving
 */
export async function handleExtensionPreviewRequest(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { prompt, category } = body;

    if (!prompt || typeof prompt !== 'string') {
      return Response.json({
        success: false,
        error: 'Prompt is required and must be a string'
      }, { status: 400 });
    }

    console.log(`[ExtensionGenerator] Generating preview for prompt: ${prompt.substring(0, 100)}...`);

    // Generate extension preview
    const extension = await generateExtension(prompt, {
      projectId: 'preview',
      category: category || '',
    });

    // Add timestamp fields that frontend expects
    const now = Date.now();
    const preview = {
      metadata: {
        ...extension.metadata,
        enabled: false,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      },
      code: extension.code,
    };

    return Response.json({
      success: true,
      data: {
        preview
      }
    });

  } catch (error: any) {
    console.error('[ExtensionGenerator] Preview error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Failed to generate preview',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
