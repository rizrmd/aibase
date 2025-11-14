import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Enum for message roles in conversations
 */
export const messageRoleEnum = pgEnum('message_role', ['system', 'user', 'assistant', 'tool']);

/**
 * Conversations table
 * Stores conversation metadata and configuration
 */
export const conversations = pgTable('conversation', {
  id: uuid('id').defaultRandom().primaryKey(),

  // User identification (nullable for anonymous users)
  userId: varchar('user_id', { length: 255 }),

  // Conversation metadata
  title: text('title').notNull(), // Auto-generated from first message or custom
  systemPrompt: text('system_prompt'), // System prompt used for this conversation
  configName: varchar('config_name', { length: 100 }).notNull().default('default'), // AI config name from ai.json

  // Model parameters stored as JSON for flexibility
  // Contains: temperature, maxTokens, topP, etc.
  modelParams: jsonb('model_params').$type<{
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    model?: string;
  }>(),

  // Additional flexible metadata
  // Can store: tags, categories, custom fields, etc.
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Soft delete support
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * Messages table
 * Stores individual messages within conversations
 */
export const messages = pgTable('conversation_message', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Foreign key to conversation
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),

  // Message metadata
  role: messageRoleEnum('role').notNull(),

  // Message content (nullable when message contains tool_calls)
  content: text('content'),

  // Tool-related fields
  // For assistant messages that call tools
  toolCalls: jsonb('tool_calls').$type<Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>>(),

  // For tool response messages
  toolCallId: varchar('tool_call_id', { length: 255 }),

  // Sequence number to maintain message order within conversation
  sequence: integer('sequence').notNull(),

  // Token usage tracking (optional but useful for analytics)
  tokenCount: integer('token_count'),

  // Additional metadata per message
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  // Timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tool execution logs table
 * Tracks tool execution history for analytics and debugging
 */
export const toolExecutions = pgTable('conversation_tools', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Reference to the message that triggered this tool
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),

  // Execution details
  toolCallId: varchar('tool_call_id', { length: 255 }).notNull(),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  arguments: jsonb('arguments').notNull(),
  result: jsonb('result'),

  // Execution status
  status: varchar('status', { length: 50 }).notNull(), // 'success', 'error', 'timeout'
  error: text('error'), // Error message if failed

  // Performance metrics
  executionTimeMs: integer('execution_time_ms'),

  // Timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Define relations between tables
 */
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  toolExecutions: many(toolExecutions),
}));

export const toolExecutionsRelations = relations(toolExecutions, ({ one }) => ({
  message: one(messages, {
    fields: [toolExecutions.messageId],
    references: [messages.id],
  }),
}));

/**
 * Type exports for TypeScript
 */
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type ToolExecution = typeof toolExecutions.$inferSelect;
export type NewToolExecution = typeof toolExecutions.$inferInsert;
