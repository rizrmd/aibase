/**
 * Handler for conversation-related API endpoints
 */

import * as fs from 'fs/promises';
import { ChatHistoryStorage } from "../storage/chat-history-storage";
import { FileStorage } from "../storage/file-storage";
import { ProjectStorage } from "../storage/project-storage";
import { generateConversationTitle, getConversationTitle, regenerateConversationTitle } from "../llm/conversation-title-generator";
import { createLogger } from "../utils/logger";
import { getConversationChatsDir } from "../config/paths";

const logger = createLogger("Conversations");

const chatHistoryStorage = ChatHistoryStorage.getInstance();
const fileStorage = FileStorage.getInstance();
const projectStorage = ProjectStorage.getInstance();

/**
 * Handle GET /api/conversations?projectId={id} - Get all conversations for a project
 */
export async function handleGetConversations(req: Request): Promise<Response> {
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

    // Get tenantId from project first (needed for listAllConversations)
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Get all conversation metadata
    const conversations = await chatHistoryStorage.listAllConversations(projectId, tenantId);

    // Enrich with cached titles only - don't generate on list to avoid slow LLM calls
    const enrichedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // Only get title if it already exists (cached in info.json)
        // Don't generate titles here to avoid blocking with LLM calls
        const title = await getConversationTitle(conv.convId, conv.projectId, tenantId);

        return {
          ...conv,
          title: title || "New Conversation",
        };
      })
    );

    return Response.json({
      success: true,
      data: { conversations: enrichedConversations },
    });
  } catch (error) {
    logger.error({ error }, "Error getting conversations");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get conversations",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/conversations/:convId/messages?projectId={id} - Get messages for a conversation
 */
export async function handleGetConversationMessages(
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Load conversation messages
    const messages = await chatHistoryStorage.loadChatHistory(convId, projectId, tenantId);

    // Filter out system messages - they should never be sent to client
    const clientMessages = messages.filter((msg) => msg.role !== "system");

    // Get metadata
    const metadata = await chatHistoryStorage.getChatHistoryMetadata(convId, projectId, tenantId);

    if (!metadata) {
      return Response.json(
        {
          success: false,
          error: "Conversation not found",
        },
        { status: 404 }
      );
    }

    // Get title
    let title = await getConversationTitle(convId, projectId, tenantId);

    // If no title exists, generate one
    if (!title && messages.length > 0) {
      title = await generateConversationTitle(messages, convId, projectId, tenantId);
    }

    return Response.json({
      success: true,
      data: {
        convId,
        projectId,
        messages: clientMessages,
        metadata: {
          ...metadata,
          title: title || "New Conversation",
        },
      },
    });
  } catch (error) {
    logger.error({ error }, "Error getting conversation messages");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get conversation messages",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE /api/conversations/:convId?projectId={id} - Delete a conversation
 */
export async function handleDeleteConversation(
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Check if conversation exists
    const metadata = await chatHistoryStorage.getChatHistoryMetadata(convId, projectId, tenantId);

    if (!metadata) {
      return Response.json(
        {
          success: false,
          error: "Conversation not found",
        },
        { status: 404 }
      );
    }

    // Delete conversation chat history
    await chatHistoryStorage.deleteChatHistory(convId, projectId, tenantId);

    // Also delete all associated files
    await fileStorage.deleteAllFiles(convId, projectId, tenantId);

    logger.info({ convId, projectId }, "Conversation and associated files deleted");

    return Response.json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    logger.error({ error }, "Error deleting conversation");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete conversation",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/conversations - Create a new chat (new JSON file in chats folder)
 */
export async function handleCreateNewChat(req: Request): Promise<Response> {
  try {
    const body = await req.json() as { projectId?: unknown; convId?: unknown };
    const { projectId, convId } = body;

    if (!projectId || !convId) {
      return Response.json(
        {
          success: false,
          error: "projectId and convId are required in request body",
        },
        { status: 400 }
      );
    }

    // Get tenantId from project
    const project = projectStorage.getById(projectId as string);
    const tenantId = project?.tenant_id ?? 'default';

    // Create new chat file with current timestamp
    const timestamp = Date.now();

    // Get the chat directory path
    const chatDir = getConversationChatsDir(projectId as string, convId as string, tenantId);

    // Ensure directory exists
    await fs.mkdir(chatDir, { recursive: true });

    // Create new chat file with empty messages (only system prompt will be added by backend)
    const chatFilePath = `${chatDir}/${timestamp}.json`;
    const newChatData = {
      metadata: {
        convId,
        projectId,
        createdAt: timestamp,
        lastUpdatedAt: timestamp,
        messageCount: 0,
      },
      messages: [],
    };

    // Write to file
    await fs.writeFile(
      chatFilePath,
      JSON.stringify(newChatData, null, 2),
      "utf-8"
    );

    logger.info(
      { projectId, convId, timestamp, filePath: chatFilePath },
      "New chat file created"
    );

    return Response.json({
      success: true,
      data: {
        convId,
        projectId,
        timestamp,
        filePath: `${projectId}/${convId}/chats/${timestamp}.json`,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error creating new chat");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create new chat",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/conversations/:convId/regenerate-title?projectId={id} - Regenerate conversation title
 */
export async function handleRegenerateConversationTitle(
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Check if conversation exists
    const metadata = await chatHistoryStorage.getChatHistoryMetadata(convId, projectId, tenantId);

    if (!metadata) {
      return Response.json(
        {
          success: false,
          error: "Conversation not found",
        },
        { status: 404 }
      );
    }

    // Regenerate the title
    const newTitle = await regenerateConversationTitle(convId, projectId, tenantId);

    logger.info({ convId, projectId, newTitle }, "Conversation title regenerated");

    return Response.json({
      success: true,
      data: { title: newTitle },
    });
  } catch (error) {
    logger.error({ error }, "Error regenerating conversation title");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to regenerate conversation title",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/embed/conversations?projectId={id}&userId={uid} - Get all conversations for an embed user
 */
export async function handleGetEmbedUserConversations(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const userId = url.searchParams.get("userId");

    if (!projectId || !userId) {
      return Response.json(
        {
          success: false,
          error: "projectId and userId query parameters are required",
        },
        { status: 400 }
      );
    }

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Get all conversation metadata for this user
    const conversations = await chatHistoryStorage.listUserConversations(projectId, tenantId, userId);

    // Enrich with cached titles only - don't generate on list to avoid slow LLM calls
    const enrichedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // Only get title if it already exists (cached in info.json)
        // Don't generate titles here to avoid blocking with LLM calls
        const title = await getConversationTitle(conv.convId, conv.projectId, tenantId);

        return {
          ...conv,
          title: title || "New Conversation",
        };
      })
    );

    return Response.json({
      success: true,
      data: { conversations: enrichedConversations },
    });
  } catch (error) {
    logger.error({ error }, "Error getting embed user conversations");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get embed user conversations",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE /api/embed/conversations/:convId?projectId={id}&userId={uid} - Delete an embed conversation
 */
export async function handleDeleteEmbedConversation(
  req: Request,
  convId: string
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const userId = url.searchParams.get("userId");

    if (!projectId || !userId) {
      return Response.json(
        {
          success: false,
          error: "projectId and userId query parameters are required",
        },
        { status: 400 }
      );
    }

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Check if conversation exists
    const metadata = await chatHistoryStorage.getChatHistoryMetadata(convId, projectId, tenantId);

    if (!metadata) {
      return Response.json(
        {
          success: false,
          error: "Conversation not found",
        },
        { status: 404 }
      );
    }

    // Delete conversation chat history (with userId)
    await chatHistoryStorage.deleteChatHistory(convId, projectId, tenantId);

    // Also delete all associated files
    await fileStorage.deleteAllFiles(convId, projectId, tenantId);

    logger.info({ convId, projectId, userId }, "Embed conversation deleted");

    return Response.json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    logger.error({ error }, "Error deleting embed conversation");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete conversation",
      },
      { status: 500 }
    );
  }
}
