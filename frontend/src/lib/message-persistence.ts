/**
 * Message persistence utility for chat history
 * Handles localStorage-based message storage and retrieval
 */

import type { Message } from "@/components/ui/chat-message";

export class MessagePersistence {
  private static readonly MESSAGES_KEY = 'chat_messages';
  private static readonly MAX_STORED_MESSAGES = 1000; // Prevent localStorage overflow

  /**
   * Save messages to localStorage
   */
  static saveMessages(messages: Message[]): void {
    if (typeof window === 'undefined') return;

    try {
      // Limit the number of messages to prevent storage issues
      const limitedMessages = messages.slice(-this.MAX_STORED_MESSAGES);

      // Convert messages to JSON-safe format
      const serializableMessages = limitedMessages.map(msg => ({
        ...msg,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt
      }));

      localStorage.setItem(this.MESSAGES_KEY, JSON.stringify(serializableMessages));
    } catch (error) {
      console.warn('Failed to save messages to localStorage:', error);
      // If storage is full, try to save fewer messages
      try {
        const fallbackMessages = messages.slice(-100);
        const serializableMessages = fallbackMessages.map(msg => ({
          ...msg,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt
        }));
        localStorage.setItem(this.MESSAGES_KEY, JSON.stringify(serializableMessages));
      } catch (fallbackError) {
        console.error('Failed to save even reduced messages:', fallbackError);
        // Clear storage if we can't save anything
        localStorage.removeItem(this.MESSAGES_KEY);
      }
    }
  }

  /**
   * Load messages from localStorage
   */
  static loadMessages(): Message[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(this.MESSAGES_KEY);
      if (!stored) return [];

      const parsedMessages = JSON.parse(stored);

      // Convert dates back to Date objects
      return parsedMessages.map((msg: any) => ({
        ...msg,
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
      }));
    } catch (error) {
      console.warn('Failed to load messages from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(this.MESSAGES_KEY);
      return [];
    }
  }

  /**
   * Clear all stored messages
   */
  static clearMessages(): void {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(this.MESSAGES_KEY);
  }

  /**
   * Get metadata about stored messages
   */
  static getStoredMessagesInfo(): {
    count: number;
    storageKey: string;
    hasMessages: boolean;
    lastMessageTime?: Date;
  } {
    if (typeof window === 'undefined') {
      return {
        count: 0,
        storageKey: this.MESSAGES_KEY,
        hasMessages: false,
      };
    }

    const messages = this.loadMessages();
    const lastMessage = messages[messages.length - 1];

    return {
      count: messages.length,
      storageKey: this.MESSAGES_KEY,
      hasMessages: messages.length > 0,
      lastMessageTime: lastMessage?.createdAt,
    };
  }
}

/**
 * React hook for message persistence
 */
import { useCallback, useEffect } from 'react';

export function useMessagePersistence(messages: Message[], setMessages: (messages: Message[]) => void) {
  // Load messages on component mount
  useEffect(() => {
    const savedMessages = MessagePersistence.loadMessages();
    if (savedMessages.length > 0) {
      console.log(`Loaded ${savedMessages.length} messages from localStorage`);
      setMessages(savedMessages);
    }
  }, [setMessages]);

  // Save messages whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      MessagePersistence.saveMessages(messages);
    }
  }, [messages]);

  // Clear messages function
  const clearStoredMessages = useCallback(() => {
    MessagePersistence.clearMessages();
    setMessages([]);
  }, [setMessages]);

  // Get stored messages info
  const getStoredInfo = useCallback(() => {
    return MessagePersistence.getStoredMessagesInfo();
  }, []);

  return {
    clearStoredMessages,
    getStoredInfo,
    saveMessages: MessagePersistence.saveMessages.bind(MessagePersistence),
    loadMessages: MessagePersistence.loadMessages.bind(MessagePersistence),
  };
}