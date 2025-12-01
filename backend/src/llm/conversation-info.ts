import * as fs from "fs/promises";
import * as path from "path";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}

export interface ConversationInfo {
  convId: string;
  projectId: string;
  createdAt: number;
  lastUpdatedAt: number;
  totalMessages: number;
  tokenUsage: {
    total: TokenUsage;
    history: TokenUsage[];
  };
}

/**
 * Get the path to the conversation info file
 */
function getInfoFilePath(convId: string, projectId: string): string {
  return path.join(process.cwd(), "data", projectId, convId, "info.json");
}

/**
 * Ensure the conversation directory exists
 */
async function ensureConvDirectory(convId: string, projectId: string): Promise<void> {
  const convDir = path.join(process.cwd(), "data", projectId, convId);
  try {
    await fs.mkdir(convDir, { recursive: true });
  } catch (error: any) {
    // Directory already exists or creation failed
  }
}

/**
 * Load conversation info from file
 */
export async function loadConversationInfo(
  convId: string,
  projectId: string
): Promise<ConversationInfo | null> {
  const infoPath = getInfoFilePath(convId, projectId);

  try {
    const content = await fs.readFile(infoPath, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Initialize a new conversation info
 */
function initializeConversationInfo(
  convId: string,
  projectId: string
): ConversationInfo {
  const now = Date.now();
  return {
    convId,
    projectId,
    createdAt: now,
    lastUpdatedAt: now,
    totalMessages: 0,
    tokenUsage: {
      total: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        timestamp: now,
      },
      history: [],
    },
  };
}

/**
 * Update conversation info with new token usage
 */
export async function updateTokenUsage(
  convId: string,
  projectId: string,
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }
): Promise<ConversationInfo> {
  // Ensure directory exists
  await ensureConvDirectory(convId, projectId);

  // Load existing info or create new
  let info = await loadConversationInfo(convId, projectId);
  if (!info) {
    info = initializeConversationInfo(convId, projectId);
  }

  const now = Date.now();
  const newUsage: TokenUsage = {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    timestamp: now,
  };

  // Update totals
  info.tokenUsage.total.promptTokens += usage.promptTokens;
  info.tokenUsage.total.completionTokens += usage.completionTokens;
  info.tokenUsage.total.totalTokens += usage.totalTokens;
  info.tokenUsage.total.timestamp = now;

  // Add to history
  info.tokenUsage.history.push(newUsage);

  // Update metadata
  info.lastUpdatedAt = now;
  info.totalMessages += 1;

  // Save to file
  const infoPath = getInfoFilePath(convId, projectId);
  await fs.writeFile(infoPath, JSON.stringify(info, null, 2), "utf-8");

  return info;
}

/**
 * Get current conversation info (read-only)
 */
export async function getConversationInfo(
  convId: string,
  projectId: string
): Promise<ConversationInfo | null> {
  return await loadConversationInfo(convId, projectId);
}
