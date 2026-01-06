/**
 * Simple in-memory message persistence service
 * Stores conversation history per conversation ID using a Record structure
 * Now also persists to disk via ChatHistoryStorage
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ChatHistoryStorage } from "../storage/chat-history-storage";
import { chatCompaction } from "../storage/chat-compaction";

export interface ConvMessageHistory {
  convId: string;
  projectId: string;
  messages: ChatCompletionMessageParam[];
  lastUpdated: number;
  messageCount: number;
}

export class MessagePersistence {
  private static instance: MessagePersistence;
  private convHistories: Record<string, ConvMessageHistory> = {};
  private chatHistoryStorage: ChatHistoryStorage;

  private constructor() {
    this.chatHistoryStorage = ChatHistoryStorage.getInstance();
  }

  /**
   * Generate cache key from projectId and convId
   */
  private getCacheKey(projectId: string, convId: string): string {
    return `${projectId}:${convId}`;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MessagePersistence {
    if (!MessagePersistence.instance) {
      MessagePersistence.instance = new MessagePersistence();
    }
    return MessagePersistence.instance;
  }

  /**
   * Get message history for a conversation
   * Loads from disk if not in memory
   */
  async getClientHistory(convId: string, projectId: string): Promise<ChatCompletionMessageParam[]> {
    const cacheKey = this.getCacheKey(projectId, convId);
    const history = this.convHistories[cacheKey];
    if (history) {
      return [...history.messages]; // Return a copy to prevent direct modification
    }

    // Try loading from disk
    try {
      const diskHistory = await this.chatHistoryStorage.loadChatHistory(convId, projectId);
      if (diskHistory.length > 0) {
        // Store in memory for faster access
        this.convHistories[cacheKey] = {
          convId,
          projectId,
          messages: diskHistory,
          lastUpdated: Date.now(),
          messageCount: diskHistory.length,
        };
        return [...diskHistory];
      }
    } catch (error) {
      console.error(`[MessagePersistence] Error loading history for ${convId}:`, error);
    }

    return [];
  }

  /**
   * Synchronous version of getClientHistory for backward compatibility
   * Only returns in-memory history
   */
  getClientHistorySync(convId: string): ChatCompletionMessageParam[] {
    const history = this.convHistories[convId];
    if (!history) {
      return [];
    }
    return [...history.messages];
  }

  /**
   * Set message history for a conversation
   * Also saves to disk
   */
  setClientHistory(
    convId: string,
    messages: ChatCompletionMessageParam[],
    projectId: string
  ): void {
    const cacheKey = this.getCacheKey(projectId, convId);
    this.convHistories[cacheKey] = {
      convId,
      projectId,
      messages: [...messages], // Store a copy
      lastUpdated: Date.now(),
      messageCount: messages.length,
    };

    // Asynchronously save to disk (don't wait)
    this.chatHistoryStorage.saveChatHistory(convId, messages, projectId).catch(error => {
      console.error(`[MessagePersistence] Error saving history for ${convId}:`, error);
    });
  }

  /**
   * Add a message to conversation history
   * Also saves to disk
   */
  addClientMessage(convId: string, message: ChatCompletionMessageParam, projectId: string): void {
    const cacheKey = this.getCacheKey(projectId, convId);
    if (!this.convHistories[cacheKey]) {
      this.convHistories[cacheKey] = {
        convId,
        projectId,
        messages: [],
        lastUpdated: Date.now(),
        messageCount: 0,
      };
    }

    this.convHistories[cacheKey].messages.push(message);
    this.convHistories[cacheKey].lastUpdated = Date.now();
    this.convHistories[cacheKey].messageCount++;

    // Asynchronously save to disk (don't wait)
    const messages = this.convHistories[cacheKey].messages;
    this.chatHistoryStorage.saveChatHistory(convId, messages, projectId).catch(error => {
      console.error(`[MessagePersistence] Error saving history for ${convId}:`, error);
    });
  }

  /**
   * Clear message history for a conversation
   */
  clearClientHistory(convId: string, projectId: string, keepSystemPrompt: boolean = true): void {
    const cacheKey = this.getCacheKey(projectId, convId);
    const history = this.convHistories[cacheKey];
    if (!history) return;

    if (keepSystemPrompt && history.messages[0]?.role === "system") {
      history.messages = [history.messages[0]];
      history.messageCount = 1;
    } else {
      history.messages = [];
      history.messageCount = 0;
    }
    history.lastUpdated = Date.now();
  }

  /**
   * Delete conversation history completely
   */
  deleteClientHistory(convId: string, projectId: string): boolean {
    const cacheKey = this.getCacheKey(projectId, convId);
    if (this.convHistories[cacheKey]) {
      delete this.convHistories[cacheKey];
      return true;
    }
    return false;
  }

  /**
   * Get all conversation histories metadata
   */
  getAllClientHistories(): Omit<ConvMessageHistory, "messages">[] {
    return Object.values(this.convHistories).map(
      ({ messages, ...metadata }) => metadata
    );
  }

  /**
   * Get statistics about stored histories
   */
  getStats(): {
    totalClients: number;
    totalMessages: number;
    oldestHistory?: number;
    newestHistory?: number;
  } {
    const histories = Object.values(this.convHistories);
    const totalMessages = histories.reduce((sum, h) => sum + h.messageCount, 0);
    const timestamps = histories.map((h) => h.lastUpdated);

    return {
      totalClients: histories.length,
      totalMessages,
      oldestHistory:
        timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestHistory:
        timestamps.length > 0 ? Math.max(...timestamps) : undefined,
    };
  }

  /**
   * Clean up old histories (older than specified milliseconds)
   */
  cleanupOldHistories(maxAge: number): number {
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;

    for (const convId in this.convHistories) {
      if (
        this.convHistories[convId] &&
        this.convHistories[convId].lastUpdated < cutoff
      ) {
        delete this.convHistories[convId];
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Check if conversation has history
   */
  hasClientHistory(convId: string, projectId: string): boolean {
    const cacheKey = this.getCacheKey(projectId, convId);
    return (
      !!this.convHistories[cacheKey] &&
      this.convHistories[cacheKey].messages.length > 0
    );
  }

  /**
   * Get message count for a conversation
   */
  getClientMessageCount(convId: string, projectId: string): number {
    const cacheKey = this.getCacheKey(projectId, convId);
    return this.convHistories[cacheKey]?.messageCount || 0;
  }

  /**
   * Check if compaction is needed and perform it
   * This should be called after adding messages
   */
  async checkAndCompact(projectId: string, convId: string): Promise<{
    compacted: boolean;
    newChatFile?: string;
    tokensSaved?: number;
  }> {
    try {
      // Check if compaction is needed
      const shouldCompact = await chatCompaction.shouldCompact(projectId, convId);

      if (!shouldCompact) {
        return { compacted: false };
      }

      // Get current messages
      const messages = await this.getClientHistory(convId, projectId);

      // Perform compaction
      const result = await chatCompaction.compactChat(projectId, convId, messages);

      if (result.compacted && result.newChatFile) {
        console.log(`[MessagePersistence] Compacted ${result.messagesCompacted} messages for ${convId}`);
        console.log(`[MessagePersistence] Saved approximately ${result.tokensSaved} tokens`);
        console.log(`[MessagePersistence] New chat file: ${result.newChatFile}`);

        // Note: We don't automatically update the in-memory history here
        // The compacted history will be loaded on next server restart
        // or when the conversation is reloaded
      }

      return {
        compacted: result.compacted,
        newChatFile: result.newChatFile,
        tokensSaved: result.tokensSaved
      };
    } catch (error) {
      console.error(`[MessagePersistence] Error during compaction check for ${convId}:`, error);
      return { compacted: false };
    }
  }

  /**
   * Get compaction status for a conversation
   */
  async getCompactionStatus(projectId: string, convId: string) {
    return await chatCompaction.getCompactionStatus(projectId, convId);
  }
}
