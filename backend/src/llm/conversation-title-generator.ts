/**
 * Conversation title generator
 * Generates AI-powered titles for conversations based on their content
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { loadConversationInfo } from "./conversation-info";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Generate a title for a conversation using AI
 * Uses the first few messages to create a concise, descriptive title
 */
export async function generateConversationTitle(
  messages: ChatCompletionMessageParam[],
  convId: string,
  projectId: string
): Promise<string> {
  // Check if title already exists in conversation info
  const existingInfo = await loadConversationInfo(convId, projectId);
  if (existingInfo?.title) {
    return existingInfo.title;
  }

  // If no messages, return a default title
  if (messages.length === 0) {
    return "New Conversation";
  }

  // Get first few messages for context (max 5)
  const contextMessages = messages.slice(0, 5);

  // Create a simple string representation of the conversation
  const conversationText = contextMessages
    .map((msg) => {
      if (typeof msg.content === "string") {
        return `${msg.role}: ${msg.content}`;
      }
      return "";
    })
    .filter((text) => text.length > 0)
    .join("\n");

  // If conversation is too short, use first user message
  if (conversationText.length < 10) {
    const firstUserMsg = messages.find(
      (msg) => msg.role === "user" && typeof msg.content === "string"
    );
    if (firstUserMsg && typeof firstUserMsg.content === "string") {
      return firstUserMsg.content.slice(0, 60).trim();
    }
    return "New Conversation";
  }

  try {
    // Initialize OpenAI client
    const client = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Use a small, fast model for title generation (to save costs)
    // Falls back to the main OPENAI_MODEL if TITLE_GENERATION_MODEL is not set
    const model = process.env.TITLE_GENERATION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Generate title using AI
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that generates concise, descriptive titles for conversations. Generate a title that is 3-8 words long, captures the main topic, and is clear and specific. Do not use quotes or special formatting. Just return the plain text title.",
        },
        {
          role: "user",
          content: `Generate a concise title for this conversation:\n\n${conversationText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 30,
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (title && title.length > 0) {
      // Save the title to conversation info
      await saveConversationTitle(convId, projectId, title);
      return title;
    }

    // Fallback to first user message if AI fails
    const firstUserMsg = messages.find(
      (msg) => msg.role === "user" && typeof msg.content === "string"
    );
    if (firstUserMsg && typeof firstUserMsg.content === "string") {
      return firstUserMsg.content.slice(0, 60).trim();
    }

    return "New Conversation";
  } catch (error) {
    console.error("[TitleGenerator] Error generating title:", error);

    // Fallback to first user message
    const firstUserMsg = messages.find(
      (msg) => msg.role === "user" && typeof msg.content === "string"
    );
    if (firstUserMsg && typeof firstUserMsg.content === "string") {
      return firstUserMsg.content.slice(0, 60).trim();
    }

    return "New Conversation";
  }
}

/**
 * Save conversation title to info.json
 */
async function saveConversationTitle(
  convId: string,
  projectId: string,
  title: string
): Promise<void> {
  const infoPath = path.join(process.cwd(), "data", projectId, convId, "info.json");

  try {
    // Load existing info
    let info = await loadConversationInfo(convId, projectId);

    if (info) {
      // Update existing info with title
      info.title = title;
      await fs.writeFile(infoPath, JSON.stringify(info, null, 2), "utf-8");
    }
  } catch (error) {
    console.error("[TitleGenerator] Error saving title:", error);
  }
}

/**
 * Get conversation title (from cache or generate if needed)
 */
export async function getConversationTitle(
  convId: string,
  projectId: string
): Promise<string | null> {
  try {
    const info = await loadConversationInfo(convId, projectId);
    return info?.title || null;
  } catch (error) {
    console.error("[TitleGenerator] Error getting title:", error);
    return null;
  }
}

/**
 * Regenerate conversation title (force regeneration even if title exists)
 */
export async function regenerateConversationTitle(
  convId: string,
  projectId: string
): Promise<string> {
  // Load conversation messages
  const { ChatHistoryStorage } = await import("../storage/chat-history-storage");
  const chatHistoryStorage = ChatHistoryStorage.getInstance();
  const messages = await chatHistoryStorage.loadChatHistory(convId, projectId);

  // If no messages, return a default title
  if (messages.length === 0) {
    return "New Conversation";
  }

  // Get first few messages for context (max 5)
  const contextMessages = messages.slice(0, 5);

  // Create a simple string representation of the conversation
  const conversationText = contextMessages
    .map((msg) => {
      if (typeof msg.content === "string") {
        return `${msg.role}: ${msg.content}`;
      }
      return "";
    })
    .filter((text) => text.length > 0)
    .join("\n");

  // If conversation is too short, use first user message
  if (conversationText.length < 10) {
    const firstUserMsg = messages.find(
      (msg) => msg.role === "user" && typeof msg.content === "string"
    );
    if (firstUserMsg && typeof firstUserMsg.content === "string") {
      const title = firstUserMsg.content.slice(0, 60).trim();
      await saveConversationTitle(convId, projectId, title);
      return title;
    }
    return "New Conversation";
  }

  try {
    // Initialize OpenAI client
    const client = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Use a small, fast model for title generation (to save costs)
    // Falls back to the main OPENAI_MODEL if TITLE_GENERATION_MODEL is not set
    const model = process.env.TITLE_GENERATION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Generate title using AI
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that generates concise, descriptive titles for conversations. Generate a title that is 3-8 words long, captures the main topic, and is clear and specific. Do not use quotes or special formatting. Just return the plain text title.",
        },
        {
          role: "user",
          content: `Generate a concise title for this conversation:\n\n${conversationText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 30,
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (title && title.length > 0) {
      // Save the title to conversation info
      await saveConversationTitle(convId, projectId, title);
      return title;
    }

    // Fallback to first user message if AI fails
    const firstUserMsg = messages.find(
      (msg) => msg.role === "user" && typeof msg.content === "string"
    );
    if (firstUserMsg && typeof firstUserMsg.content === "string") {
      const fallbackTitle = firstUserMsg.content.slice(0, 60).trim();
      await saveConversationTitle(convId, projectId, fallbackTitle);
      return fallbackTitle;
    }

    return "New Conversation";
  } catch (error) {
    console.error("[TitleGenerator] Error regenerating title:", error);

    // Fallback to first user message
    const firstUserMsg = messages.find(
      (msg) => msg.role === "user" && typeof msg.content === "string"
    );
    if (firstUserMsg && typeof firstUserMsg.content === "string") {
      const fallbackTitle = firstUserMsg.content.slice(0, 60).trim();
      await saveConversationTitle(convId, projectId, fallbackTitle);
      return fallbackTitle;
    }

    return "New Conversation";
  }
}
