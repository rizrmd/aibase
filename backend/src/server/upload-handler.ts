/**
 * HTTP file upload handler
 * Handles multipart/form-data file uploads
 */

import { FileStorage, type FileScope } from '../storage/file-storage';
import { ProjectStorage } from '../storage/project-storage';
import { FileContextStorage } from '../storage/file-context-storage';
import { createLogger } from '../utils/logger';
import sharp from 'sharp';
import * as path from 'path';
import { extensionHookRegistry } from '../tools/extensions/extension-hooks';
import { ExtensionLoader } from '../tools/extensions/extension-loader';
import type { WSServer } from '../ws/entry';
import { getProjectFilesDir } from '../config/paths';

const logger = createLogger('Upload');

/**
 * Ensure extensions are loaded for a project (for hooks to be registered)
 *
 * Note: We create a new ExtensionLoader instance each time to ensure hooks
 * are properly registered for the current request context.
 */
async function ensureExtensionsLoaded(projectId: string): Promise<void> {
  try {
    const extensionLoader = new ExtensionLoader();

    // Load extensions (this registers hooks)
    await extensionLoader.loadExtensions(projectId);

    logger.info({ projectId }, 'Extensions loaded for hook registration');
  } catch (error) {
    logger.warn({ projectId, error }, 'Failed to load extensions, hooks may not be available');
  }
}

export interface UploadedFileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: number;
  scope: FileScope;
  description?: string;
  title?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const THUMBNAIL_SIZE = 300; // pixels for the longest side

/**
 * Broadcast status message to all clients for a conversation
 */
function broadcastStatus(wsServer: WSServer | undefined, convId: string, status: string, message: string) {
  if (!wsServer) return;

  try {
    wsServer.broadcastToConv(convId, {
      type: 'status',
      id: `status_${Date.now()}`,
      data: { status, message },
      metadata: { timestamp: Date.now() },
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to broadcast status');
  }
}

/**
 * Check if a file is an image based on its MIME type or extension
 */
function isImageFile(fileName: string, mimeType: string): boolean {
  const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'];
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif'];

  if (imageMimeTypes.includes(mimeType)) return true;

  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && imageExtensions.includes(ext)) return true;

  return false;
}

/**
 * Generate a thumbnail for an image
 */
async function generateThumbnail(
  imageBuffer: Buffer,
  fileName: string,
  projectId: string
): Promise<string | null> {
  try {
    // Create sharp instance from buffer
    const image = sharp(imageBuffer);

    // Get image metadata
    const metadata = await image.metadata();

    // Don't generate thumbnail if image is already smaller than thumbnail size
    if (metadata.width && metadata.width <= THUMBNAIL_SIZE && metadata.height && metadata.height <= THUMBNAIL_SIZE) {
      return null;
    }

    // Generate thumbnail filename
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const thumbnailFileName = `${baseName}.thumb${ext}`;

    // Get tenantId for this project
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);
    if (!project) {
      return null;
    }
    const tenantId = project.tenant_id ?? 'default';

    // Use centralized path config to ensure consistency
    const thumbnailPath = path.join(getProjectFilesDir(projectId, tenantId), thumbnailFileName);

    // Resize and save thumbnail
    await image
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFile(thumbnailPath);

    logger.info({ thumbnailPath }, 'Thumbnail generated');

    return `/api/files/${projectId}/${convId}/${thumbnailFileName}`;
  } catch (error) {
    logger.error({ error, fileName }, 'Failed to generate thumbnail');
    return null;
  }
}

/**
 * Handle file upload via HTTP POST
 */
export async function handleFileUpload(req: Request, wsServer?: WSServer): Promise<Response> {
  console.log('[UPLOAD-HANDLER] ============================================');
  console.log('[UPLOAD-HANDLER] File upload request received');
  try {
    // Get conversation ID and project ID from query params
    const url = new URL(req.url);
    let convId = url.searchParams.get('convId');
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return Response.json(
        { success: false, error: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);
    if (!project) {
      return Response.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return Response.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      );
    }

    // Get scope from form data, default to 'user'
    const scopeParam = formData.get('scope');
    const scope: FileScope = (scopeParam === 'public' || scopeParam === 'user') ? scopeParam : 'user';

    const fileStorage = FileStorage.getInstance();
    const uploadedFiles: UploadedFileInfo[] = [];
    const tenantId = project.tenant_id ?? 'default';

    for (const file of files) {
      if (!(file instanceof File)) {
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          {
            success: false,
            error: `File ${file.name} exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
          },
          { status: 413 }
        );
      }

      logger.info({
        file: file.name,
        size: file.size,
        type: file.type,
        scope
      }, 'Processing file');

      // Broadcast: Starting to process file
      broadcastStatus(wsServer, convId, 'processing', `Uploading ${file.name}...`);

      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Generate thumbnail for images BEFORE saving file (so we have the URL)
      let thumbnailUrl: string | undefined;
      const isImage = isImageFile(file.name, file.type);
      if (isImage) {
        broadcastStatus(wsServer, convId, 'processing', `Generating thumbnail for ${file.name}...`);
        thumbnailUrl = await generateThumbnail(buffer, file.name, projectId) || undefined;
      }

      // Save file with scope and thumbnail URL
      broadcastStatus(wsServer, convId, 'processing', `Saving ${file.name}...`);
      const storedFile = await fileStorage.saveFile(
        convId,
        file.name,
        buffer,
        file.type,
        projectId,
        tenantId,
        scope,
        thumbnailUrl
      );

      // Generate unique ID for the file reference
      const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      // Use centralized path config to ensure consistency with tenant-based structure
      const filePath = path.join(getProjectFilesDir(projectId, tenantId), storedFile.name);

      // Wait for extension hooks to complete (blocking)
      // This ensures the description is available when the AI responds
      console.log('[UPLOAD-HANDLER] Starting extension analysis for file:', file.name);

      // Ensure extensions are loaded (hooks registered) before executing hooks
      await ensureExtensionsLoaded(projectId);

      // Broadcast: Analyzing file
      broadcastStatus(wsServer, convId, 'processing', `Analyzing ${file.name}...`);

      const hookResult = await extensionHookRegistry.executeHook('afterFileUpload', {
        convId,
        projectId,
        fileName: storedFile.name,
        filePath,
        fileType: file.type,
        fileSize: file.size,
      });

      console.log('[UPLOAD-HANDLER] Extension hook execution result:', { fileName: file.name, hookResult });

      let fileDescription: string | undefined;
      let fileTitle: string | undefined;

      if (hookResult?.description && typeof hookResult.description === 'string') {
        console.log('[UPLOAD-HANDLER] Extension hook generated description for', file.name, ':', hookResult.description.substring(0, 100));
        fileDescription = hookResult.description;

        // Use title from extension hook if provided
        if (hookResult.title && typeof hookResult.title === 'string') {
          fileTitle = hookResult.title;
          console.log('[UPLOAD-HANDLER] Extension hook generated title:', fileTitle);
        }

        // Update file metadata with description and title (if provided by extension)
        try {
          await fileStorage.updateFileMeta('', storedFile.name, projectId, tenantId, {
            description: hookResult.description,
            title: fileTitle
          });
          console.log('[UPLOAD-HANDLER] File metadata updated with description and title:', fileTitle);
        } catch (updateError) {
          console.error('[UPLOAD-HANDLER] Failed to update file metadata:', updateError);
        }
      } else {
        console.log('[UPLOAD-HANDLER] Extension hook: No description generated');
      }

      // Broadcast: Upload and analysis complete
      broadcastStatus(wsServer, convId, 'complete', `Successfully uploaded ${file.name}`);

      uploadedFiles.push({
        id: fileId,
        name: storedFile.name,
        size: storedFile.size,
        type: storedFile.type,
        url: `/api/files/${projectId}/${storedFile.name}`,
        thumbnailUrl: storedFile.thumbnailUrl,
        uploadedAt: storedFile.uploadedAt,
        scope: storedFile.scope,
        description: fileDescription,  // Include description in response
        title: fileTitle,  // Include title in response
      });

      logger.info({ path: storedFile.path, scope }, 'File saved');
    }

    // Auto-check logic: If total files < 10, automatically include new files in context
    try {
      const fileContextStorage = FileContextStorage.getInstance();
      const allFiles = await fileStorage.listFiles(convId || '', projectId, tenantId);

      console.log(`[UPLOAD-HANDLER] Total files in project ${projectId}: ${allFiles.length}`);

      if (allFiles.length < 10) {
        console.log(`[UPLOAD-HANDLER] Auto-checking ${uploadedFiles.length} new files in context (total files: ${allFiles.length} < 10)`);
        await fileContextStorage.bulkSetFilesInContext(
          uploadedFiles.map(f => f.id),
          true,
          projectId,
          tenantId
        );
        console.log(`[UPLOAD-HANDLER] Successfully auto-checked ${uploadedFiles.length} files in context`);
      } else {
        console.log(`[UPLOAD-HANDLER] Not auto-checking files (total files: ${allFiles.length} >= 10)`);
      }
    } catch (error) {
      // Log error but don't fail the upload
      console.error('[UPLOAD-HANDLER] Failed to auto-check files in context:', error);
    }

    return Response.json({
      success: true,
      files: uploadedFiles,
    });

  } catch (error: any) {
    logger.error({ error }, 'Upload error');
    return Response.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle file download/retrieval
 */
export async function handleFileDownload(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');

    // Expected: /api/files/{projectId}/{fileName}
    if (pathParts.length < 5) {
      return new Response('Invalid file path', { status: 400 });
    }

    const projectId = pathParts[3];
    const fileName = pathParts[4];

    if (!projectId || !fileName) {
      return new Response('Invalid file path', { status: 400 });
    }

    // Get project to retrieve tenant_id
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);
    if (!project) {
      return new Response('Project not found', { status: 404 });
    }

    const fileStorage = FileStorage.getInstance();
    const tenantId = project.tenant_id ?? 'default';
    const fileBuffer = await fileStorage.getFile('', fileName, projectId, tenantId);

    // Try to determine content type from extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    const contentType = getContentType(ext ?? 'application/octet-stream');

    // Convert Buffer to Uint8Array for Response
    const uint8Array = new Uint8Array(fileBuffer);

    return new Response(uint8Array, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });

  } catch (error: any) {
    logger.error({ error }, 'Download error');
    if (error.code === 'ENOENT') {
      return new Response('File not found', { status: 404 });
    }
    return new Response('Download failed', { status: 500 });
  }
}

function getContentType(ext: string | undefined): string {
  const types: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'json': 'application/json',
    'csv': 'text/csv',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg',
  };

  return types[ext || ''] || 'application/octet-stream';
}
