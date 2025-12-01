/**
 * Chat history storage service
 * Persists conversation history to disk at:
 * /data/{proj-id}/{conv-id}/chats/{conv-start-timestamp}.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

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
  private defaultProjectId = 'A1'; // Hardcoded for now
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
  private getChatDir(convId: string, projectId?: string): string {
    const projId = projectId || this.defaultProjectId;
    return path.join(this.baseDir, projId, convId, 'chats');
  }

  /**
   * Get the chat file path for a conversation
   */
  private getChatFilePath(convId: string, projectId?: string): string {
    const chatDir = this.getChatDir(convId, projectId);
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
  private async ensureChatDir(convId: string, projectId?: string): Promise<void> {
    const chatDir = this.getChatDir(convId, projectId);
    await fs.mkdir(chatDir, { recursive: true });
  }

  /**
   * Load chat history from disk
   * Returns empty array if file doesn't exist
   */
  async loadChatHistory(
    convId: string,
    projectId?: string
  ): Promise<ChatCompletionMessageParam[]> {
    const projId = projectId || this.defaultProjectId;
    const chatDir = this.getChatDir(convId, projId);

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
    projectId?: string
  ): Promise<void> {
    const projId = projectId || this.defaultProjectId;

    try {
      // Ensure directory exists
      await this.ensureChatDir(convId, projId);

      const filePath = this.getChatFilePath(convId, projId);
      const timestamp = this.convStartTimes.get(convId) || Date.now();

      const chatHistory: ChatHistoryFile = {
        metadata: {
          convId,
          projectId: projId,
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
    projectId?: string
  ): Promise<string[]> {
    const chatDir = this.getChatDir(convId, projectId);

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
    projectId?: string
  ): Promise<void> {
    const chatDir = this.getChatDir(convId, projectId);

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
    projectId?: string
  ): Promise<ChatHistoryMetadata | null> {
    const chatDir = this.getChatDir(convId, projectId);

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
}
