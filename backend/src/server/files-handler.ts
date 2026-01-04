/**
 * Handler for file management API endpoints
 */

import { FileStorage } from "../storage/file-storage";
import { ChatHistoryStorage } from "../storage/chat-history-storage";
import { createLogger } from "../utils/logger";
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger("Files");

const fileStorage = FileStorage.getInstance();
const chatHistoryStorage = ChatHistoryStorage.getInstance();

export interface FileWithConversation {
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  convId: string;
  conversationTitle?: string;
  url: string;
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

    // Get all conversations for the project
    const conversations = await chatHistoryStorage.listAllConversations(projectId);

    // Get files for each conversation
    const filesPromises = conversations.map(async (conv) => {
      const files = await fileStorage.listFiles(conv.convId, projectId);

      return files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        convId: conv.convId,
        url: `/api/files/${projectId}/${conv.convId}/${file.name}`,
      }));
    });

    const filesArrays = await Promise.all(filesPromises);
    const allFiles = filesArrays.flat();

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

    // Get files for the conversation
    const files = await fileStorage.listFiles(convId, projectId);

    const filesWithUrls = files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: file.uploadedAt,
      convId,
      url: `/api/files/${projectId}/${convId}/${file.name}`,
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
 * Handle DELETE /api/files/:projectId/:convId/:fileName - Delete a specific file
 */
export async function handleDeleteFile(
  req: Request,
  projectId: string,
  convId: string,
  fileName: string
): Promise<Response> {
  try {
    await fileStorage.deleteFile(convId, fileName, projectId);

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
