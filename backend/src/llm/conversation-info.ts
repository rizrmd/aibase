import * as fs from "fs/promises";
import * as path from "path";
import { getConversationDir } from "../config/paths";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}

export interface ConversationInfo {
  convId: string;
  projectId: string;
  tenantId: number | string;
  createdAt: number;
  lastUpdatedAt: number;
  totalMessages: number;
  title?: string; // AI-generated conversation title
  tokenUsage: {
    total: TokenUsage;
    history: TokenUsage[];
  };
}

/**
 * Get the path to the conversation info file
 */
function getInfoFilePath(convId: string, projectId: string, tenantId: number | string): string {
  return path.join(getConversationDir(projectId, convId, tenantId), "info.json");
}

/**
 * Ensure the conversation directory exists
 */
async function ensureConvDirectory(convId: string, projectId: string, tenantId: number | string): Promise<void> {
  const convDir = getConversationDir(projectId, convId, tenantId);
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
  projectId: string,
  tenantId: number | string
): Promise<ConversationInfo | null> {
  const infoPath = getInfoFilePath(convId, projectId, tenantId);

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
  projectId: string,
  tenantId: number | string
): ConversationInfo {
  const now = Date.now();
  return {
    convId,
    projectId,
    tenantId,
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
  tenantId: number | string,
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }
): Promise<ConversationInfo> {
  // Ensure directory exists
  await ensureConvDirectory(convId, projectId, tenantId);

  // Load existing info or create new
  let info = await loadConversationInfo(convId, projectId, tenantId);
  if (!info) {
    info = initializeConversationInfo(convId, projectId, tenantId);
  }

  const now = Date.now();
  const newUsage: TokenUsage = {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    timestamp: now,
  };

  // Update totals (OpenAI returns cumulative counts, so just set the values, don't add)
  info.tokenUsage.total.promptTokens = usage.promptTokens;
  info.tokenUsage.total.completionTokens = usage.completionTokens;
  info.tokenUsage.total.totalTokens = usage.totalTokens;
  info.tokenUsage.total.timestamp = now;

  // Add to history
  info.tokenUsage.history.push(newUsage);

  // Update metadata
  info.lastUpdatedAt = now;
  info.totalMessages += 1;

  // Save to file
  const infoPath = getInfoFilePath(convId, projectId, tenantId);
  await fs.writeFile(infoPath, JSON.stringify(info, null, 2), "utf-8");

  return info;
}

/**
 * Get current conversation info (read-only)
 */
export async function getConversationInfo(
  convId: string,
  projectId: string,
  tenantId: number | string
): Promise<ConversationInfo | null> {
  return await loadConversationInfo(convId, projectId, tenantId);
}
