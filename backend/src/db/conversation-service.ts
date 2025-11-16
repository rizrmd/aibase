import { getDb } from './connection';
import { conversations, messages, type Conversation, type Message, type NewMessage } from './schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * Service for persisting and retrieving conversations from the database
 */
export class ConversationDB {
  /**
   * Create a new conversation in the database
   */
  async createConversation(data: {
    id: string;
    userId?: string;
    title?: string;
    systemPrompt?: string;
    configName?: string;
    modelParams?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      model?: string;
    };
    metadata?: Record<string, any>;
  }): Promise<Conversation> {
    const result = await getDb()
      .insert(conversations)
      .values({
        id: data.id,
        userId: data.userId,
        title: data.title || 'New Conversation',
        systemPrompt: data.systemPrompt,
        configName: data.configName || 'default',
        modelParams: data.modelParams,
        metadata: data.metadata,
      })
      .returning();

    if (!result[0]) {
      throw new Error('Failed to create conversation');
    }

    return result[0];
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const [conversation] = await getDb()
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)));

    return conversation || null;
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(
    conversationId: string,
    updates: {
      title?: string;
      systemPrompt?: string;
      modelParams?: any;
      metadata?: any;
    }
  ): Promise<Conversation | null> {
    const [updated] = await getDb()
      .update(conversations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
      .returning();

    return updated || null;
  }

  /**
   * Soft delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    const [deleted] = await getDb()
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .returning();

    return !!deleted;
  }

  /**
   * Get all messages for a conversation
   */
  async getMessages(conversationId: string): Promise<Message[]> {
    return await getDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.sequence);
  }

  /**
   * Add a single message to a conversation
   */
  async addMessage(conversationId: string, message: ChatCompletionMessageParam, sequence: number): Promise<Message> {
    const messageData: NewMessage = {
      conversationId,
      role: message.role as any,
      content: typeof message.content === 'string' ? message.content : null,
      sequence,
    };

    // Handle tool calls for assistant messages
    if (message.role === 'assistant' && 'tool_calls' in message && message.tool_calls) {
      messageData.toolCalls = message.tool_calls as any;
    }

    // Handle tool response messages
    if (message.role === 'tool' && 'tool_call_id' in message) {
      messageData.toolCallId = message.tool_call_id;
    }

    const result = await getDb().insert(messages).values(messageData).returning();

    if (!result[0]) {
      throw new Error('Failed to insert message');
    }

    // Update conversation's updatedAt timestamp
    await getDb()
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return result[0];
  }

  /**
   * Add multiple messages to a conversation
   */
  async addMessages(conversationId: string, msgs: ChatCompletionMessageParam[]): Promise<Message[]> {
    if (msgs.length === 0) return [];

    // Get the current highest sequence number
    const existingMessages = await this.getMessages(conversationId);
    let sequence = existingMessages.length;

    const messagesToInsert: NewMessage[] = msgs.map((msg) => {
      const messageData: NewMessage = {
        conversationId,
        role: msg.role as any,
        content: typeof msg.content === 'string' ? msg.content : null,
        sequence: sequence++,
      };

      // Handle tool calls for assistant messages
      if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
        messageData.toolCalls = msg.tool_calls as any;
      }

      // Handle tool response messages
      if (msg.role === 'tool' && 'tool_call_id' in msg) {
        messageData.toolCallId = msg.tool_call_id;
      }

      return messageData;
    });

    const inserted = await getDb().insert(messages).values(messagesToInsert).returning();

    // Update conversation's updatedAt timestamp
    await getDb()
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return inserted;
  }

  /**
   * Clear all messages for a conversation (except optionally system prompt)
   */
  async clearMessages(conversationId: string, keepSystemPrompt = true): Promise<void> {
    if (keepSystemPrompt) {
      // Delete all messages except system messages
      await getDb()
        .delete(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'user')));

      await getDb()
        .delete(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'assistant')));

      await getDb()
        .delete(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'tool')));
    } else {
      // Delete all messages
      await getDb().delete(messages).where(eq(messages.conversationId, conversationId));
    }

    // Update conversation's updatedAt timestamp
    await getDb()
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  /**
   * Convert database messages to OpenAI format
   */
  messagesToChatFormat(msgs: Message[]): ChatCompletionMessageParam[] {
    return msgs.map((msg) => {
      const baseMessage: any = {
        role: msg.role,
      };

      if (msg.content) {
        baseMessage.content = msg.content;
      }

      if (msg.toolCalls && msg.role === 'assistant') {
        baseMessage.tool_calls = msg.toolCalls;
      }

      if (msg.toolCallId && msg.role === 'tool') {
        baseMessage.tool_call_id = msg.toolCallId;
        baseMessage.content = msg.content || '';
      }

      return baseMessage;
    });
  }

  /**
   * Load full conversation with messages
   */
  async loadFullConversation(conversationId: string): Promise<{
    conversation: Conversation | null;
    messages: ChatCompletionMessageParam[];
  }> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      return { conversation: null, messages: [] };
    }

    const dbMessages = await this.getMessages(conversationId);
    const chatMessages = this.messagesToChatFormat(dbMessages);

    return { conversation, messages: chatMessages };
  }

  /**
   * List conversations for a user
   */
  async listConversations(userId?: string, limit = 50): Promise<Conversation[]> {
    const whereConditions = userId
      ? and(isNull(conversations.deletedAt), eq(conversations.userId, userId))
      : isNull(conversations.deletedAt);

    return await getDb()
      .select()
      .from(conversations)
      .where(whereConditions)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }

  /**
   * Check if a conversation exists
   */
  async exists(conversationId: string): Promise<boolean> {
    const conversation = await this.getConversation(conversationId);
    return !!conversation;
  }

  /**
   * Get conversation message count
   */
  async getMessageCount(conversationId: string): Promise<number> {
    const msgs = await this.getMessages(conversationId);
    return msgs.length;
  }

  /**
   * Auto-generate title from first user message
   */
  async autoGenerateTitle(conversationId: string): Promise<void> {
    const msgs = await this.getMessages(conversationId);
    const firstUserMessage = msgs.find((m) => m.role === 'user');

    if (firstUserMessage && firstUserMessage.content) {
      // Take first 50 characters of the first message as title
      const title = firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');

      await this.updateConversation(conversationId, { title });
    }
  }
}

/**
 * Singleton instance
 */
export const conversationService = new ConversationDB();
