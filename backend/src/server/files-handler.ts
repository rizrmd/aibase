/**
 * Handler for file management API endpoints
 */

import { FileStorage, type FileScope } from "../storage/file-storage";
import { ProjectStorage } from "../storage/project-storage";
import { ChatHistoryStorage } from "../storage/chat-history-storage";
import { createLogger } from "../utils/logger";
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger("Files");

const fileStorage = FileStorage.getInstance();
const projectStorage = ProjectStorage.getInstance();
const chatHistoryStorage = ChatHistoryStorage.getInstance();

export interface FileWithConversation {
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  convId: string;
  conversationTitle?: string;
  url: string;
  thumbnailUrl?: string;
  scope: FileScope;
}

/**
 * Handle GET /api/files?projectId={id} - Get all files for a project
 */
export async function handleGetProjectFiles(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId) {
      return Response.json(
        {
          success: false,
          error: "projectId query parameter is required",
        },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const project = projectStorage.getById(projectId);
    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }
    const tenantId = project.tenant_id ?? 'default';

    // Get all conversation directories for the project (from the files folder)
    const { getProjectDir } = await import('../config/paths');
    const projectDir = getProjectDir(projectId, tenantId);
    const filesBaseDir = path.join(projectDir, "files");

    // Check if files directory exists
    try {
      await fs.access(filesBaseDir);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return Response.json({
          success: true,
          data: { files: [] },
        });
      }
      throw error;
    }

    // Read all conversation directories in the files folder
    const entries = await fs.readdir(filesBaseDir, { withFileTypes: true });
    const convDirs = entries.filter(entry => entry.isDirectory());

    logger.info({ projectId, convDirCount: convDirs.length, convDirs: convDirs.map(d => d.name) }, 'Found conversation directories in files folder');

    // Get files for each conversation directory
    const filesPromises = convDirs.map(async (convDir) => {
      const convId = convDir.name;
      const files = await fileStorage.listFiles(convId, projectId, tenantId);

      logger.info({ convId, fileCount: files.length, files: files.map(f => f.name) }, 'Files in conversation');

      return files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        convId: convId,
        url: `/api/files/${projectId}/${convId}/${file.name}`,
        thumbnailUrl: file.thumbnailUrl,
        scope: file.scope,
      }));
    });

    const filesArrays = await Promise.all(filesPromises);
    const allFiles = filesArrays.flat();

    logger.info({ projectId, totalFiles: allFiles.length }, 'Total files found');

    // Sort by upload date (most recent first)
    allFiles.sort((a, b) => b.uploadedAt - a.uploadedAt);

    return Response.json({
      success: true,
      data: { files: allFiles },
    });
  } catch (error) {
    logger.error({ error }, "Error getting project files");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get project files",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/conversations/:convId/files?projectId={id} - Get files for a specific conversation
 */
export async function handleGetConversationFiles(
  req: Request,
  convId: string
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId) {
      return Response.json(
        {
          success: false,
          error: "projectId query parameter is required",
        },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const project = projectStorage.getById(projectId);
    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }
    const tenantId = project.tenant_id ?? 'default';

    // Get files for the conversation
    const files = await fileStorage.listFiles(convId, projectId, tenantId);

    const filesWithUrls = files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: file.uploadedAt,
      convId,
      url: `/api/files/${projectId}/${convId}/${file.name}`,
      thumbnailUrl: file.thumbnailUrl,
      scope: file.scope,
    }));

    return Response.json({
      success: true,
      data: { files: filesWithUrls },
    });
  } catch (error) {
    logger.error({ error }, "Error getting conversation files");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get conversation files",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle PATCH /api/files/:projectId/:convId/:fileName/rename - Rename a file
 */
export async function handleRenameFile(
  req: Request,
  projectId: string,
  convId: string,
  fileName: string
): Promise<Response> {
  try {
    const body = await req.json() as { newName?: unknown };
    const { newName } = body;

    if (!newName) {
      return Response.json(
        {
          success: false,
          error: "newName is required in request body",
        },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const project = projectStorage.getById(projectId);
    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }
    const tenantId = project.tenant_id ?? 'default';

    await fileStorage.renameFile(convId, fileName, newName as string, projectId, tenantId);

    return Response.json({
      success: true,
      message: "File renamed successfully",
      data: {
        oldName: fileName,
        newName,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error renaming file");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to rename file",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/files/move - Move a file to a different conversation
 */
export async function handleMoveFile(req: Request): Promise<Response> {
  try {
    const body = await req.json() as {
      projectId?: unknown;
      fromConvId?: unknown;
      toConvId?: unknown;
      fileName?: unknown;
    };
    const { projectId, fromConvId, toConvId, fileName } = body;

    if (!projectId || !fromConvId || !toConvId || !fileName) {
      return Response.json(
        {
          success: false,
          error: "projectId, fromConvId, toConvId, and fileName are required",
        },
        { status: 400 }
      );
    }

    // Get project to retrieve tenant_id
    const project = projectStorage.getById(projectId as string);
    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }
    const tenantId = project.tenant_id ?? 'default';

    await fileStorage.moveFile(fromConvId as string, toConvId as string, fileName as string, projectId as string, tenantId);

    return Response.json({
      success: true,
      message: "File moved successfully",
      data: {
        fromConvId,
        toConvId,
        fileName,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error moving file");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to move file",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE /api/files/:projectId/:convId/:fileName - Delete a specific file
 */
export async function handleDeleteFile(
  req: Request,
  projectId: string,
  convId: string,
  fileName: string
): Promise<Response> {
  try {
    // Get project to retrieve tenant_id
    const project = projectStorage.getById(projectId);
    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }
    const tenantId = project.tenant_id ?? 'default';

    await fileStorage.deleteFile(convId, fileName, projectId, tenantId);

    return Response.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    logger.error({ error }, "Error deleting file");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete file",
      },
      { status: 500 }
    );
  }
}
