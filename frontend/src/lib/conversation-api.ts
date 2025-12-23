/**
 * Conversation API client
 * Handles HTTP requests for conversation-related operations
 */

import { buildApiUrl } from "@/lib/base-path";

// Use buildApiUrl to support base path
const API_BASE_URL = buildApiUrl("");

export interface ConversationMetadata {
  convId: string;
  projectId: string;
  createdAt: number;
  lastUpdatedAt: number;
  messageCount: number;
  title?: string;
}

export interface ConversationWithTitle extends ConversationMetadata {
  title: string;
}

export interface ConversationMessagesResponse {
  convId: string;
  projectId: string;
  messages: any[];
  metadata: ConversationMetadata & { title: string };
}

/**
 * Fetch all conversations for a project
 */
export async function fetchConversations(
  projectId: string
): Promise<ConversationWithTitle[]> {
  const response = await fetch(`${API_BASE_URL}/api/conversations?projectId=${projectId}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch conversations");
  }

  return data.data.conversations;
}

/**
 * Fetch messages for a specific conversation
 */
export async function fetchConversationMessages(
  convId: string,
  projectId: string
): Promise<ConversationMessagesResponse> {
  const response = await fetch(
    `/api/conversations/${convId}/messages?projectId=${projectId}`
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch conversation messages");
  }

  return data.data;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  convId: string,
  projectId: string
): Promise<void> {
  const response = await fetch(
    `/api/conversations/${convId}?projectId=${projectId}`,
    {
      method: "DELETE",
    }
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to delete conversation");
  }
}
