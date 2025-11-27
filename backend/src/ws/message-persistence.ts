/**
 * Simple in-memory message persistence service
 * Stores conversation history per client ID using a Record structure
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface ClientMessageHistory {
  clientId: string;
  messages: ChatCompletionMessageParam[];
  lastUpdated: number;
  messageCount: number;
}

export class MessagePersistence {
  private static instance: MessagePersistence;
  private clientHistories: Record<string, ClientMessageHistory> = {};

  private constructor() {}

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
   * Get message history for a client
   */
  getClientHistory(clientId: string): ChatCompletionMessageParam[] {
    const history = this.clientHistories[clientId];
    if (!history) {
      return [];
    }
    return [...history.messages]; // Return a copy to prevent direct modification
  }

  /**
   * Set message history for a client
   */
  setClientHistory(clientId: string, messages: ChatCompletionMessageParam[]): void {
    this.clientHistories[clientId] = {
      clientId,
      messages: [...messages], // Store a copy
      lastUpdated: Date.now(),
      messageCount: messages.length,
    };
  }

  /**
   * Add a message to client history
   */
  addClientMessage(clientId: string, message: ChatCompletionMessageParam): void {
    if (!this.clientHistories[clientId]) {
      this.clientHistories[clientId] = {
        clientId,
        messages: [],
        lastUpdated: Date.now(),
        messageCount: 0,
      };
    }

    this.clientHistories[clientId].messages.push(message);
    this.clientHistories[clientId].lastUpdated = Date.now();
    this.clientHistories[clientId].messageCount++;
  }

  /**
   * Clear message history for a client
   */
  clearClientHistory(clientId: string, keepSystemPrompt: boolean = true): void {
    const history = this.clientHistories[clientId];
    if (!history) return;

    if (keepSystemPrompt && history.messages[0]?.role === "system") {
      this.clientHistories[clientId].messages = [history.messages[0]];
      this.clientHistories[clientId].messageCount = 1;
    } else {
      this.clientHistories[clientId].messages = [];
      this.clientHistories[clientId].messageCount = 0;
    }
    this.clientHistories[clientId].lastUpdated = Date.now();
  }

  /**
   * Delete client history completely
   */
  deleteClientHistory(clientId: string): boolean {
    if (this.clientHistories[clientId]) {
      delete this.clientHistories[clientId];
      return true;
    }
    return false;
  }

  /**
   * Get all client histories metadata
   */
  getAllClientHistories(): Omit<ClientMessageHistory, "messages">[] {
    return Object.values(this.clientHistories).map(({ messages, ...metadata }) => metadata);
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
    const histories = Object.values(this.clientHistories);
    const totalMessages = histories.reduce((sum, h) => sum + h.messageCount, 0);
    const timestamps = histories.map(h => h.lastUpdated);

    return {
      totalClients: histories.length,
      totalMessages,
      oldestHistory: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestHistory: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
    };
  }

  /**
   * Clean up old histories (older than specified milliseconds)
   */
  cleanupOldHistories(maxAge: number): number {
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;

    for (const clientId in this.clientHistories) {
      if (this.clientHistories[clientId].lastUpdated < cutoff) {
        delete this.clientHistories[clientId];
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Check if client has history
   */
  hasClientHistory(clientId: string): boolean {
    return !!this.clientHistories[clientId] && this.clientHistories[clientId].messages.length > 0;
  }

  /**
   * Get message count for a client
   */
  getClientMessageCount(clientId: string): number {
    return this.clientHistories[clientId]?.messageCount || 0;
  }
}