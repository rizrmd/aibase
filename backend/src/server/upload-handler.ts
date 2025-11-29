/**
 * HTTP file upload handler
 * Handles multipart/form-data file uploads
 */

import { FileStorage } from '../storage/file-storage';

export interface UploadedFileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DEFAULT_PROJECT_ID = 'A1'; // Hardcoded for now

/**
 * Handle file upload via HTTP POST
 */
export async function handleFileUpload(req: Request): Promise<Response> {
  try {
    // Get conversation ID and project ID from query params
    const url = new URL(req.url);
    const convId = url.searchParams.get('convId');
    const projectId = url.searchParams.get('projectId') || DEFAULT_PROJECT_ID;

    if (!convId) {
      return Response.json(
        { success: false, error: 'Missing convId parameter' },
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

      console.log(`[Upload] Processing file: ${file.name} (${file.size} bytes, ${file.type})`);

      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Save file
      const storedFile = await fileStorage.saveFile(
        convId,
        file.name,
        buffer,
        file.type,
        projectId
      );

      // Generate unique ID for the file reference
      const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      uploadedFiles.push({
        id: fileId,
        name: storedFile.name,
        size: storedFile.size,
        type: storedFile.type,
        url: `/api/files/${projectId}/${convId}/${storedFile.name}`,
        uploadedAt: storedFile.uploadedAt,
      });

      console.log(`[Upload] File saved: ${storedFile.path}`);
    }

    return Response.json({
      success: true,
      files: uploadedFiles,
    });

  } catch (error: any) {
    console.error('[Upload] Error:', error);
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

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });

  } catch (error: any) {
    console.error('[Download] Error:', error);
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
