/**
 * HTTP file upload handler
 * Handles multipart/form-data file uploads
 */

import { FileStorage, FileScope } from '../storage/file-storage';
import { createLogger } from '../utils/logger';
import * as sharp from 'sharp';
import * as path from 'path';

const logger = createLogger('Upload');

export interface UploadedFileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: number;
  scope: FileScope;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const THUMBNAIL_SIZE = 300; // pixels for the longest side

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
  convId: string,
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
    const thumbnailPath = path.join(process.cwd(), 'data', projectId, convId, 'files', thumbnailFileName);

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
export async function handleFileUpload(req: Request): Promise<Response> {
  try {
    // Get conversation ID and project ID from query params
    const url = new URL(req.url);
    const convId = url.searchParams.get('convId');
    const projectId = url.searchParams.get('projectId');

    if (!convId) {
      return Response.json(
        { success: false, error: 'Missing convId parameter' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return Response.json(
        { success: false, error: 'Missing projectId parameter' },
        { status: 400 }
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

      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Generate thumbnail for images BEFORE saving file (so we have the URL)
      let thumbnailUrl: string | undefined;
      if (isImageFile(file.name, file.type)) {
        thumbnailUrl = await generateThumbnail(buffer, file.name, convId, projectId) || undefined;
      }

      // Save file with scope and thumbnail URL
      const storedFile = await fileStorage.saveFile(
        convId,
        file.name,
        buffer,
        file.type,
        projectId,
        scope,
        thumbnailUrl
      );

      // Generate unique ID for the file reference
      const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      uploadedFiles.push({
        id: fileId,
        name: storedFile.name,
        size: storedFile.size,
        type: storedFile.type,
        url: `/api/files/${projectId}/${convId}/${storedFile.name}`,
        thumbnailUrl: storedFile.thumbnailUrl,
        uploadedAt: storedFile.uploadedAt,
        scope: storedFile.scope,
      });

      logger.info({ path: storedFile.path, scope }, 'File saved');
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

    // Expected: /api/files/{projectId}/{convId}/{fileName}
    if (pathParts.length < 6) {
      return new Response('Invalid file path', { status: 400 });
    }

    const projectId = pathParts[3];
    const convId = pathParts[4];
    const fileName = pathParts[5];

    const fileStorage = FileStorage.getInstance();
    const fileBuffer = await fileStorage.getFile(convId, fileName, projectId);

    // Try to determine content type from extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    const contentType = getContentType(ext);

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
