/**
 * Handle saving base64 image data from frontend
 * Used for auto-saving visualizations (charts, tables, mermaid diagrams)
 */

import { FileStorage } from '../storage/file-storage';
import { createLogger } from '../utils/logger';

const logger = createLogger('ImageSave');

export interface SavedImageInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB for base64 images

/**
 * Handle base64 image save via HTTP POST
 * POST /api/save-image?convId=xxx&projectId=xxx
 * Body: { filename: string, base64: string }
 */
export async function handleSaveImage(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const convId = url.searchParams.get('convId');
    const projectId = url.searchParams.get('projectId');

    if (!convId || !projectId) {
      return Response.json(
        { success: false, error: 'Missing convId or projectId' },
        { status: 400 }
      );
    }

    const body = await req.json() as { filename?: string; base64?: string };
    const { filename, base64 } = body;

    if (!filename || !base64) {
      return Response.json(
        { success: false, error: 'Missing filename or base64 data' },
        { status: 400 }
      );
    }

    // Validate filename has .png extension
    if (!filename.toLowerCase().endsWith('.png')) {
      return Response.json(
        { success: false, error: 'Filename must end with .png' },
        { status: 400 }
      );
    }

    // Security: Validate filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return Response.json(
        { success: false, error: 'Invalid filename' },
        { status: 400 }
      );
    }

    // Convert base64 to Buffer
    const base64Data = base64.includes('base64,')
      ? base64.split('base64,')[1]
      : base64;

    const buffer = Buffer.from(base64Data, 'base64');

    // Validate image size
    if (buffer.length > MAX_IMAGE_SIZE) {
      return Response.json(
        {
          success: false,
          error: `Image size exceeds maximum of ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
        },
        { status: 413 }
      );
    }

    logger.info({
      filename,
      size: buffer.length,
      convId,
      projectId
    }, 'Saving visualization image');

    // Save file using existing FileStorage
    const fileStorage = FileStorage.getInstance();
    const storedFile = await fileStorage.saveFile(
      convId,
      filename,
      buffer,
      'image/png',
      projectId,
      'user' // Default scope
    );

    // Generate unique ID
    const fileId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const result: SavedImageInfo = {
      id: fileId,
      name: storedFile.name,
      size: storedFile.size,
      type: storedFile.type,
      url: `/api/files/${projectId}/${convId}/${storedFile.name}`,
      uploadedAt: storedFile.uploadedAt,
    };

    logger.info({ path: storedFile.path, url: result.url }, 'Image saved successfully');

    return Response.json({
      success: true,
      file: result,
    });

  } catch (error: any) {
    logger.error({ error }, 'Image save error');
    return Response.json(
      { success: false, error: error.message || 'Failed to save image' },
      { status: 500 }
    );
  }
}
