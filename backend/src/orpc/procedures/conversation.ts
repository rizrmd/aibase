import { os } from '@orpc/server';
import { z } from 'zod';
import { Conversation, Tool } from '../../llm/conversation';
import { conversationService } from '../../db/conversation-service';

/**
 * Store active conversations by ID in memory
 * Database is used for persistence
 */
const conversations = new Map<string, Conversation>();

/**
 * Schema definitions
 */
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  tool_call_id: z.string().optional(),
});

export const ConversationConfigSchema = z.object({
  conversationId: z.string().min(1),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  configName: z.string().optional(),
});

export const SendMessageSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1),
});

export const HistoryRequestSchema = z.object({
  conversationId: z.string().min(1),
});

/**
 * Helper to get or create a conversation with persistence
 */
async function getOrCreateConversation(
  conversationId: string,
  config?: z.infer<typeof ConversationConfigSchema>
): Promise<Conversation> {
  // Check memory cache first
  let conversation = conversations.get(conversationId);

  if (!conversation) {
    // Try to load from database
    const { conversation: dbConversation, messages: dbMessages } = await conversationService.loadFullConversation(conversationId);

    if (dbConversation) {
      // Restore conversation from database
      conversation = new Conversation({
        systemPrompt: dbConversation.systemPrompt || config?.systemPrompt,
        temperature: dbConversation.modelParams?.temperature ?? config?.temperature,
        maxTokens: dbConversation.modelParams?.maxTokens ?? config?.maxTokens,
        configName: dbConversation.configName || config?.configName,
        initialHistory: dbMessages,
        hooks: {
          // Auto-save on history changes
          history: async (history) => {
            // Save only new messages (messages not yet in DB)
            const currentCount = await conversationService.getMessageCount(conversationId);
            const newMessages = history.slice(currentCount);
            if (newMessages.length > 0) {
              await conversationService.addMessages(conversationId, newMessages);
            }
          },
        },
      });
    } else {
      // Create new conversation
      conversation = new Conversation({
        systemPrompt: config?.systemPrompt,
        temperature: config?.temperature,
        maxTokens: config?.maxTokens,
        configName: config?.configName,
        hooks: {
          // Auto-save on history changes
          history: async (history) => {
            const currentCount = await conversationService.getMessageCount(conversationId);
            const newMessages = history.slice(currentCount);
            if (newMessages.length > 0) {
              await conversationService.addMessages(conversationId, newMessages);
            }
          },
        },
      });

      // Save to database
      await conversationService.createConversation({
        id: conversationId,
        systemPrompt: config?.systemPrompt,
        configName: config?.configName,
        modelParams: {
          temperature: config?.temperature,
          maxTokens: config?.maxTokens,
        },
      });

      // Auto-generate title after first message
      if (conversation.history.length > 0) {
        await conversationService.autoGenerateTitle(conversationId);
      }
    }

    conversations.set(conversationId, conversation);
  }

  return conversation;
}

/**
 * Create a new conversation
 */
export const createConversation = os
  .input(ConversationConfigSchema)
  .handler(async ({ input }) => {
    const conversation = await getOrCreateConversation(input.conversationId, input);

    return {
      conversationId: input.conversationId,
      created: true,
      historyLength: conversation.history.length,
    };
  });

/**
 * Send a message to a conversation (non-streaming)
 */
export const sendMessage = os
  .input(SendMessageSchema)
  .handler(async ({ input }) => {
    const conversation = await getOrCreateConversation(input.conversationId);

    // Use the conversation's sendMessage which returns full text when awaited
    const response = await conversation.sendMessage(input.message);

    return {
      conversationId: input.conversationId,
      response,
      historyLength: conversation.history.length,
    };
  });

/**
 * Get conversation history
 */
export const getHistory = os
  .input(HistoryRequestSchema)
  .handler(async ({ input }) => {
    // Try to load from database if not in memory
    const conversation = await getOrCreateConversation(input.conversationId);

    return {
      conversationId: input.conversationId,
      history: conversation.history,
      exists: true,
    };
  });

/**
 * Clear conversation history
 */
export const clearHistory = os
  .input(
    z.object({
      conversationId: z.string().min(1),
      keepSystemPrompt: z.boolean().default(true),
    })
  )
  .handler(async ({ input }) => {
    const conversation = conversations.get(input.conversationId);

    if (!conversation) {
      return {
        conversationId: input.conversationId,
        cleared: false,
        error: 'Conversation not found',
      };
    }

    // Clear in memory
    conversation.clearHistory(input.keepSystemPrompt);

    // Clear in database
    await conversationService.clearMessages(input.conversationId, input.keepSystemPrompt);

    return {
      conversationId: input.conversationId,
      cleared: true,
      historyLength: conversation.history.length,
    };
  });

/**
 * Delete a conversation
 */
export const deleteConversation = os
  .input(HistoryRequestSchema)
  .handler(async ({ input }) => {
    // Delete from memory
    const existed = conversations.has(input.conversationId);
    conversations.delete(input.conversationId);

    // Soft delete from database
    await conversationService.deleteConversation(input.conversationId);

    return {
      conversationId: input.conversationId,
      deleted: existed,
    };
  });

/**
 * List all active conversations
 */
export const listConversations = os
  .input(
    z
      .object({
        userId: z.string().optional(),
        limit: z.number().int().positive().default(50),
      })
      .optional()
  )
  .handler(async ({ input }) => {
    // Get from database for persistent list
    const dbConversations = await conversationService.listConversations(input?.userId, input?.limit);

    const conversationList = dbConversations.map((conv) => ({
      conversationId: conv.id,
      title: conv.title,
      userId: conv.userId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      configName: conv.configName,
    }));

    return {
      conversations: conversationList,
      total: conversationList.length,
    };
  });

/**
 * Export the conversation map for WebSocket access
 */
export { conversations };
