/**
 * Simple in-memory message persistence service
 * Stores conversation history per conversation ID using a Record structure
 * Now also persists to disk via ChatHistoryStorage
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ChatHistoryStorage } from "../storage/chat-history-storage";

export interface ConvMessageHistory {
  convId: string;
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
  async getClientHistory(convId: string): Promise<ChatCompletionMessageParam[]> {
    const history = this.convHistories[convId];
    if (history) {
      return [...history.messages]; // Return a copy to prevent direct modification
    }

    // Try loading from disk
    try {
      const diskHistory = await this.chatHistoryStorage.loadChatHistory(convId);
      if (diskHistory.length > 0) {
        // Store in memory for faster access
        this.convHistories[convId] = {
          convId,
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
    messages: ChatCompletionMessageParam[]
  ): void {
    this.convHistories[convId] = {
      convId,
      messages: [...messages], // Store a copy
      lastUpdated: Date.now(),
      messageCount: messages.length,
    };

    // Asynchronously save to disk (don't wait)
    this.chatHistoryStorage.saveChatHistory(convId, messages).catch(error => {
      console.error(`[MessagePersistence] Error saving history for ${convId}:`, error);
    });
  }

  /**
   * Add a message to conversation history
   * Also saves to disk
   */
  addClientMessage(convId: string, message: ChatCompletionMessageParam): void {
    if (!this.convHistories[convId]) {
      this.convHistories[convId] = {
        convId,
        messages: [],
        lastUpdated: Date.now(),
        messageCount: 0,
      };
    }

    this.convHistories[convId].messages.push(message);
    this.convHistories[convId].lastUpdated = Date.now();
    this.convHistories[convId].messageCount++;

    // Asynchronously save to disk (don't wait)
    const messages = this.convHistories[convId].messages;
    this.chatHistoryStorage.saveChatHistory(convId, messages).catch(error => {
      console.error(`[MessagePersistence] Error saving history for ${convId}:`, error);
    });
  }

  /**
   * Clear message history for a conversation
   */
  clearClientHistory(convId: string, keepSystemPrompt: boolean = true): void {
    const history = this.convHistories[convId];
    if (!history) return;

    if (convId && this.convHistories[convId]) {
      if (keepSystemPrompt && history.messages[0]?.role === "system") {
        this.convHistories[convId].messages = [history.messages[0]];
        this.convHistories[convId].messageCount = 1;
      } else {
        this.convHistories[convId].messages = [];
        this.convHistories[convId].messageCount = 0;
      }
      this.convHistories[convId].lastUpdated = Date.now();
    }
  }

  /**
   * Delete conversation history completely
   */
  deleteClientHistory(convId: string): boolean {
    if (this.convHistories[convId]) {
      delete this.convHistories[convId];
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
  hasClientHistory(convId: string): boolean {
    return (
      !!this.convHistories[convId] &&
      this.convHistories[convId].messages.length > 0
    );
  }

  /**
   * Get message count for a conversation
   */
  getClientMessageCount(convId: string): number {
    return this.convHistories[convId]?.messageCount || 0;
  }
}
