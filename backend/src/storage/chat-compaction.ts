import { promises as fs } from 'fs';
import path from 'path';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import OpenAI from 'openai';
import { getConversationDir, getConversationChatsDir } from '../config/paths';

interface CompactionConfig {
  // Token threshold to trigger compaction (default: 150K tokens)
  tokenThreshold: number;
  // Number of recent messages to keep in full (default: 20)
  keepRecentMessages: number;
  // Model to use for compaction summary
  compactionModel?: string;
}

interface CompactionResult {
  compacted: boolean;
  newChatFile?: string;
  tokensSaved?: number;
  messagesCompacted?: number;
}

const DEFAULT_CONFIG: CompactionConfig = {
  tokenThreshold: 150000,
  keepRecentMessages: 20,
  compactionModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
};

/**
 * Chat Compaction Service
 * Handles compacting chat history when token usage exceeds threshold
 */
export class ChatCompaction {
  private config: CompactionConfig;

  constructor(config?: Partial<CompactionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if compaction is needed based on token usage
   */
  async shouldCompact(projectId: string, convId: string, tenantId: number | string): Promise<boolean> {
    const infoPath = path.join(getConversationDir(projectId, convId, tenantId), 'info.json');

    try {
      // Check if file exists first
      try {
        await fs.access(infoPath);
      } catch {
        // File doesn't exist yet - no compaction needed
        return false;
      }

      const infoContent = await fs.readFile(infoPath, 'utf-8');
      const info = JSON.parse(infoContent);

      const totalTokens = info.tokenUsage?.total?.totalTokens || 0;
      return totalTokens >= this.config.tokenThreshold;
    } catch (error) {
      // Only log if it's not a file not found error
      if ((error as any).code !== 'ENOENT') {
        console.error('Error checking compaction threshold:', error);
      }
      return false;
    }
  }

  /**
   * Perform compaction on chat history
   * Creates a new chat file with compacted messages prepended
   */
  async compactChat(
    projectId: string,
    convId: string,
    tenantId: number | string,
    messages: ChatCompletionMessageParam[]
  ): Promise<CompactionResult> {
    try {
      // Separate system message, messages to compact, and recent messages
      const systemMessage = messages.find(m => m.role === 'system');
      const nonSystemMessages = messages.filter(m => m.role !== 'system');

      // If not enough messages to compact, skip
      if (nonSystemMessages.length <= this.config.keepRecentMessages) {
        return { compacted: false };
      }

      // Split messages
      const messagesToCompact = nonSystemMessages.slice(0, -this.config.keepRecentMessages);
      const recentMessages = nonSystemMessages.slice(-this.config.keepRecentMessages);

      // Create compacted summary
      const compactedMessage = await this.createCompactedSummary(messagesToCompact);

      // Build new message array
      const newMessages: ChatCompletionMessageParam[] = [];
      if (systemMessage) {
        newMessages.push(systemMessage);
      }
      newMessages.push(compactedMessage);
      newMessages.push(...recentMessages);

      // Create new chat file with timestamp
      const timestamp = Date.now();
      const newChatFile = await this.saveCompactedChat(
        projectId,
        convId,
        tenantId,
        newMessages,
        timestamp
      );

      return {
        compacted: true,
        newChatFile,
        messagesCompacted: messagesToCompact.length,
        tokensSaved: await this.estimateTokensSaved(messagesToCompact, compactedMessage)
      };
    } catch (error) {
      console.error('Error during chat compaction:', error);
      return { compacted: false };
    }
  }

  /**
   * Create a compacted summary of messages using LLM
   */
  private async createCompactedSummary(
    messages: ChatCompletionMessageParam[]
  ): Promise<ChatCompletionMessageParam> {
    const llmProvider = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY
    });

    // Build a summary prompt
    const summaryPrompt = `You are a chat history compactor. Your task is to create a concise but comprehensive summary of the following conversation history.

IMPORTANT GUIDELINES:
1. Preserve all important facts, decisions, and context
2. Keep track of key topics discussed
3. Maintain chronological flow
4. Include any important code, data, or technical details mentioned
5. Note any files, databases, or systems discussed
6. Keep memory items and configuration details
7. Be concise but don't lose critical information

Format the summary as a clear, structured narrative that can serve as context for future conversations.

CONVERSATION HISTORY TO COMPACT (${messages.length} messages):

${messages.map((msg, idx) => {
  if (msg.role === 'user') {
    return `[${idx}] USER: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`;
  } else if (msg.role === 'assistant') {
    // For assistant, only include the text content, not tool calls
    return `[${idx}] ASSISTANT: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`;
  } else if (msg.role === 'tool') {
    return `[${idx}] TOOL: ${msg.content?.substring(0, 200)}...`;
  }
  return '';
}).filter(Boolean).join('\n\n')}

Create a comprehensive summary that preserves all important context:`;

    try {
      // Call LLM to create summary
      const completion = await llmProvider.chat.completions.create({
        model: this.config.compactionModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });

      const summary = completion.choices[0]?.message?.content || 'Unable to generate summary';

      // Return as a system message
      return {
        role: 'system',
        content: `=== COMPACTED CONVERSATION HISTORY ===
This is a summary of ${messages.length} earlier messages to preserve context while reducing token usage.

${summary}

=== END OF COMPACTED HISTORY ===

The conversation continues below with recent messages:`
      };
    } catch (error) {
      console.error('Error creating compacted summary:', error);

      // Fallback: create a simple summary without LLM
      return {
        role: 'system',
        content: `=== COMPACTED CONVERSATION HISTORY ===
Compacted ${messages.length} messages from earlier in this conversation.
Key topics: ${this.extractKeyTopics(messages)}
=== END OF COMPACTED HISTORY ===`
      };
    }
  }

  /**
   * Extract key topics from messages (simple fallback)
   */
  private extractKeyTopics(messages: ChatCompletionMessageParam[]): string {
    const topics: string[] = [];
    messages.forEach(msg => {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        const words = msg.content.split(' ').slice(0, 5).join(' ');
        if (words.length > 0) {
          topics.push(words);
        }
      }
    });
    return topics.slice(0, 5).join('; ');
  }

  /**
   * Save compacted chat history to new file
   */
  private async saveCompactedChat(
    projectId: string,
    convId: string,
    tenantId: number | string,
    messages: ChatCompletionMessageParam[],
    timestamp: number
  ): Promise<string> {
    const chatsDir = getConversationChatsDir(projectId, convId, tenantId);
    await fs.mkdir(chatsDir, { recursive: true });

    const chatFile = path.join(chatsDir, `${timestamp}.json`);
    const chatData = {
      metadata: {
        convId,
        projectId,
        tenantId,
        createdAt: timestamp,
        lastUpdatedAt: timestamp,
        messageCount: messages.length,
        compacted: true
      },
      messages
    };

    await fs.writeFile(chatFile, JSON.stringify(chatData, null, 2));
    return chatFile;
  }

  /**
   * Estimate tokens saved by compaction
   */
  private async estimateTokensSaved(
    originalMessages: ChatCompletionMessageParam[],
    compactedMessage: ChatCompletionMessageParam
  ): Promise<number> {
    // Rough estimate: ~4 characters per token
    const originalLength = originalMessages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + (content?.length || 0);
    }, 0);

    const compactedLength = typeof compactedMessage.content === 'string'
      ? compactedMessage.content.length
      : JSON.stringify(compactedMessage.content).length;

    return Math.floor((originalLength - compactedLength) / 4);
  }

  /**
   * Get compaction status and recommendation
   */
  async getCompactionStatus(projectId: string, convId: string, tenantId: number | string): Promise<{
    shouldCompact: boolean;
    currentTokens: number;
    threshold: number;
    utilizationPercent: number;
  }> {
    const infoPath = path.join(getConversationDir(projectId, convId, tenantId), 'info.json');

    try {
      // Check if file exists first
      try {
        await fs.access(infoPath);
      } catch {
        // File doesn't exist yet - return default status
        return {
          shouldCompact: false,
          currentTokens: 0,
          threshold: this.config.tokenThreshold,
          utilizationPercent: 0
        };
      }

      const infoContent = await fs.readFile(infoPath, 'utf-8');
      const info = JSON.parse(infoContent);

      const currentTokens = info.tokenUsage?.total?.totalTokens || 0;
      const utilizationPercent = (currentTokens / this.config.tokenThreshold) * 100;

      return {
        shouldCompact: currentTokens >= this.config.tokenThreshold,
        currentTokens,
        threshold: this.config.tokenThreshold,
        utilizationPercent: Math.round(utilizationPercent * 100) / 100
      };
    } catch (error) {
      // Only log if it's not a file not found error
      if ((error as any).code !== 'ENOENT') {
        console.error('Error getting compaction status:', error);
      }
      return {
        shouldCompact: false,
        currentTokens: 0,
        threshold: this.config.tokenThreshold,
        utilizationPercent: 0
      };
    }
  }
}

// Export singleton instance
export const chatCompaction = new ChatCompaction();
