/**
 * Chat history storage service
 * Persists conversation history to disk at:
 * /data/projects/{tenantId}/{proj-id}/{userId}/{conv-id}/chats/{conv-start-timestamp}.json
 *
 * For anonymous users (no userId), uses "anonymous" as the user path.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getConversationChatsDir } from '../config/paths';

export interface ChatHistoryMetadata {
  convId: string;
  projectId: string;
  createdAt: number;
  lastUpdatedAt: number;
  messageCount: number;
}

export interface ChatHistoryFile {
  metadata: ChatHistoryMetadata;
  messages: ChatCompletionMessageParam[];
}

export class ChatHistoryStorage {
  private static instance: ChatHistoryStorage;
  private baseDir: string;
  private convStartTimes = new Map<string, number>(); // Track conversation start times

  private constructor() {
    // Use absolute path from project root
    this.baseDir = path.join(process.cwd(), 'data');
  }

  static getInstance(): ChatHistoryStorage {
    if (!ChatHistoryStorage.instance) {
      ChatHistoryStorage.instance = new ChatHistoryStorage();
    }
    return ChatHistoryStorage.instance;
  }

  /**
   * Get the chat directory path for a conversation
   */
  private getChatDir(convId: string, projectId: string, tenantId: number | string, userId?: string): string {
    const userPath = userId || 'anonymous';
    // Custom path for chat history: {tenantId}/{projectId}/{userId}/{convId}/chats
    // We use the conversation dir and append userId
    const convDir = path.join(getConversationChatsDir(projectId, convId, tenantId), '..', '..', userPath, convId, 'chats');
    return convDir;
  }

  /**
   * Get the chat file path for a conversation
   */
  private getChatFilePath(convId: string, projectId: string, tenantId: number | string, userId?: string): string {
    const chatDir = this.getChatDir(convId, projectId, tenantId, userId);
    const timestamp = this.convStartTimes.get(convId) || Date.now();

    // Store the timestamp for this conversation if not already set
    if (!this.convStartTimes.has(convId)) {
      this.convStartTimes.set(convId, timestamp);
    }

    return path.join(chatDir, `${timestamp}.json`);
  }

  /**
   * Ensure chat directory exists
   */
  private async ensureChatDir(convId: string, projectId: string, tenantId: number | string, userId?: string): Promise<void> {
    const chatDir = this.getChatDir(convId, projectId, tenantId, userId);
    await fs.mkdir(chatDir, { recursive: true });
  }

  /**
   * Load chat history from disk
   * Returns empty array if file doesn't exist
   */
  async loadChatHistory(
    convId: string,
    projectId: string,
    tenantId: number | string,
    userId?: string
  ): Promise<ChatCompletionMessageParam[]> {
    const chatDir = this.getChatDir(convId, projectId, tenantId, userId);

    try {
      // Check if chat directory exists
      const dirExists = await fs.access(chatDir).then(() => true).catch(() => false);
      if (!dirExists) {
        return [];
      }

      // List all chat history files
      const files = await fs.readdir(chatDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        return [];
      }

      // Get the most recent chat file (highest timestamp)
      const latestFile = jsonFiles.sort().reverse()[0];
      if (!latestFile) {
        return [];
      }

      // Extract timestamp from filename and store it
      const timestamp = parseInt(latestFile.replace('.json', ''));
      if (!isNaN(timestamp)) {
        this.convStartTimes.set(convId, timestamp);
      }

      const filePath = path.join(chatDir, latestFile);
      const content = await fs.readFile(filePath, 'utf-8');
      const data: ChatHistoryFile = JSON.parse(content);

      console.log(`[ChatHistoryStorage] Loaded ${data.messages.length} messages from ${latestFile}`);
      return data.messages;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet
        return [];
      }
      console.error('[ChatHistoryStorage] Error loading chat history:', error);
      throw error;
    }
  }

  /**
   * Save chat history to disk
   */
  async saveChatHistory(
    convId: string,
    messages: ChatCompletionMessageParam[],
    projectId: string,
    tenantId: number | string,
    userId?: string
  ): Promise<void> {
    try {
      // Ensure directory exists
      await this.ensureChatDir(convId, projectId, tenantId, userId);

      const filePath = this.getChatFilePath(convId, projectId, tenantId, userId);
      const timestamp = this.convStartTimes.get(convId) || Date.now();

      const chatHistory: ChatHistoryFile = {
        metadata: {
          convId,
          projectId,
          createdAt: timestamp,
          lastUpdatedAt: Date.now(),
          messageCount: messages.length,
        },
        messages,
      };

      // Write to file with pretty formatting
      await fs.writeFile(
        filePath,
        JSON.stringify(chatHistory, null, 2),
        'utf-8'
      );

      console.log(`[ChatHistoryStorage] Saved ${messages.length} messages to ${path.basename(filePath)}`);
    } catch (error) {
      console.error('[ChatHistoryStorage] Error saving chat history:', error);
      throw error;
    }
  }

  /**
   * Get all chat history files for a conversation
   */
  async listChatHistoryFiles(
    convId: string,
    projectId: string,
    tenantId: number | string,
    userId?: string
  ): Promise<string[]> {
    const chatDir = this.getChatDir(convId, projectId, tenantId, userId);

    try {
      const files = await fs.readdir(chatDir);
      return files.filter(f => f.endsWith('.json')).sort().reverse();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete all chat history files for a conversation
   */
  async deleteChatHistory(
    convId: string,
    projectId: string,
    tenantId: number | string,
    userId?: string
  ): Promise<void> {
    const chatDir = this.getChatDir(convId, projectId, tenantId, userId);

    try {
      await fs.rm(chatDir, { recursive: true, force: true });
      this.convStartTimes.delete(convId);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get chat history metadata without loading all messages
   */
  async getChatHistoryMetadata(
    convId: string,
    projectId: string,
    tenantId: number | string,
    userId?: string
  ): Promise<ChatHistoryMetadata | null> {
    const chatDir = this.getChatDir(convId, projectId, tenantId, userId);

    try {
      const files = await fs.readdir(chatDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        return null;
      }

      const latestFile = jsonFiles.sort().reverse()[0];
      if (!latestFile) {
        return null;
      }

      const filePath = path.join(chatDir, latestFile);
      const content = await fs.readFile(filePath, 'utf-8');
      const data: ChatHistoryFile = JSON.parse(content);

      return data.metadata;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all conversations for a project
   * Returns metadata for each conversation sorted by lastUpdatedAt (descending)
   */
  async listAllConversations(
    projectId: string,
    tenantId: number | string
  ): Promise<ChatHistoryMetadata[]> {
    const { getProjectDir } = await import('../config/paths');
    const projectDir = getProjectDir(projectId, tenantId);

    try {
      // Check if project directory exists
      const dirExists = await fs.access(projectDir).then(() => true).catch(() => false);
      if (!dirExists) {
        return [];
      }

      // Read all conversation directories (across all users)
      const entries = await fs.readdir(projectDir, { withFileTypes: true });
      const userDirs = entries.filter(entry => entry.isDirectory());

      // Collect all conversation IDs from all users
      const allConvIds = new Set<string>();
      for (const userDir of userDirs) {
        const userPath = path.join(projectDir, userDir.name);
        try {
          const convEntries = await fs.readdir(userPath, { withFileTypes: true });
          for (const convEntry of convEntries) {
            if (convEntry.isDirectory()) {
              allConvIds.add(convEntry.name);
            }
          }
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.error(`Error reading user directory ${userDir.name}:`, error);
          }
        }
      }

      // Get metadata for each conversation in parallel
      const metadataPromises = Array.from(allConvIds).map(async (convId) => {
        return await this.getChatHistoryMetadata(convId, projectId, tenantId);
      });

      const metadataResults = await Promise.all(metadataPromises);
      const conversations = metadataResults.filter((m): m is ChatHistoryMetadata => m !== null);

      // Sort by lastUpdatedAt descending (most recent first)
      conversations.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);

      return conversations;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error('[ChatHistoryStorage] Error listing conversations:', error);
      throw error;
    }
  }

  /**
   * List all conversations for a specific user within a project
   * Returns metadata for each conversation sorted by lastUpdatedAt (descending)
   */
  async listUserConversations(
    projectId: string,
    tenantId: number | string,
    userId: string
  ): Promise<ChatHistoryMetadata[]> {
    const { getProjectDir } = await import('../config/paths');
    const userDir = path.join(getProjectDir(projectId, tenantId), userId);

    try {
      // Check if user directory exists
      const dirExists = await fs.access(userDir).then(() => true).catch(() => false);
      if (!dirExists) {
        return [];
      }

      // Read all conversation directories for this user
      const entries = await fs.readdir(userDir, { withFileTypes: true });
      const convDirs = entries.filter(entry => entry.isDirectory());

      // Get metadata for each conversation in parallel
      const metadataPromises = convDirs.map(async (convDir) => {
        const convId = convDir.name;
        return await this.getChatHistoryMetadata(convId, projectId, tenantId, userId);
      });

      const metadataResults = await Promise.all(metadataPromises);
      const conversations = metadataResults.filter((m): m is ChatHistoryMetadata => m !== null);

      // Sort by lastUpdatedAt descending (most recent first)
      conversations.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);

      return conversations;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error('[ChatHistoryStorage] Error listing user conversations:', error);
      throw error;
    }
  }
}
