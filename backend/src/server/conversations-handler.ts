/**
 * Handler for conversation-related API endpoints
 */

import { ChatHistoryStorage } from "../storage/chat-history-storage";
import { FileStorage } from "../storage/file-storage";
import { generateConversationTitle, getConversationTitle } from "../llm/conversation-title-generator";
import { createLogger } from "../utils/logger";

const logger = createLogger("Conversations");

const chatHistoryStorage = ChatHistoryStorage.getInstance();
const fileStorage = FileStorage.getInstance();

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

    // Get all conversation metadata
    const conversations = await chatHistoryStorage.listAllConversations(projectId);

    // Enrich with cached titles only - don't generate on list to avoid slow LLM calls
    const enrichedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // Only get title if it already exists (cached in info.json)
        // Don't generate titles here to avoid blocking with LLM calls
        const title = await getConversationTitle(conv.convId, conv.projectId);

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

    // Load conversation messages
    const messages = await chatHistoryStorage.loadChatHistory(convId, projectId);

    // Filter out system messages - they should never be sent to client
    const clientMessages = messages.filter((msg) => msg.role !== "system");

    // Get metadata
    const metadata = await chatHistoryStorage.getChatHistoryMetadata(convId, projectId);

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
    let title = await getConversationTitle(convId, projectId);

    // If no title exists, generate one
    if (!title && messages.length > 0) {
      title = await generateConversationTitle(messages, convId, projectId);
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

    // Check if conversation exists
    const metadata = await chatHistoryStorage.getChatHistoryMetadata(convId, projectId);

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
    await chatHistoryStorage.deleteChatHistory(convId, projectId);

    // Also delete all associated files
    await fileStorage.deleteAllFiles(convId, projectId);

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
