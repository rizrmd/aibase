# Database Schema Documentation

## Overview

This directory contains the database schema and connection configuration for conversation persistence using **Drizzle ORM** and **Bun's native PostgreSQL driver**.

## Files

- `schema.ts` - Database schema definitions and TypeScript types
- `connection.ts` - Database connection using Bun.sql
- `migrate.ts` - Migration runner script
- `test-connection.ts` - Connection test utility
- `test-schema.ts` - Schema validation tests

## Schema Structure

### Tables

#### 1. `conversations`
Stores conversation metadata and configuration.

**Columns:**
- `id` (uuid, PK) - Unique conversation identifier
- `user_id` (varchar) - User identification (nullable for anonymous)
- `title` (text) - Conversation title
- `system_prompt` (text) - System prompt for the conversation
- `config_name` (varchar) - AI config name from ai.json
- `model_params` (jsonb) - Model parameters (temperature, maxTokens, topP)
- `metadata` (jsonb) - Additional flexible metadata
- `created_at`, `updated_at`, `deleted_at` (timestamps)

#### 2. `messages`
Stores individual messages within conversations.

**Columns:**
- `id` (uuid, PK) - Unique message identifier
- `conversation_id` (uuid, FK) - References conversations(id)
- `role` (enum) - Message role: system, user, assistant, tool
- `content` (text) - Message content (nullable for tool calls)
- `tool_calls` (jsonb) - Tool calls data for assistant messages
- `tool_call_id` (varchar) - Tool call ID for tool response messages
- `sequence` (integer) - Message order within conversation
- `token_count` (integer) - Optional token count tracking
- `metadata` (jsonb) - Additional metadata
- `created_at` (timestamp)

#### 3. `tools`
Registry of available tools.

**Columns:**
- `id` (uuid, PK) - Unique tool identifier
- `name` (varchar, unique) - Tool name
- `description` (text) - Tool description
- `parameters` (jsonb) - JSON schema for parameters
- `implementation` (text) - Optional implementation reference
- `version` (varchar) - Tool version
- `is_active` (boolean) - Whether tool is active
- `metadata` (jsonb) - Additional metadata
- `created_at`, `updated_at` (timestamps)

#### 4. `conversation_tools`
Many-to-many relationship between conversations and tools.

**Columns:**
- `id` (uuid, PK)
- `conversation_id` (uuid, FK) - References conversations(id)
- `tool_id` (uuid, FK) - References tools(id)
- `added_at` (timestamp) - When tool was added to conversation

#### 5. `tool_executions`
Logs of tool execution for analytics and debugging.

**Columns:**
- `id` (uuid, PK)
- `message_id` (uuid, FK) - References messages(id)
- `tool_id` (uuid, FK) - References tools(id)
- `tool_call_id` (varchar) - Tool call identifier
- `tool_name` (varchar) - Tool name
- `arguments` (jsonb) - Tool execution arguments
- `result` (jsonb) - Tool execution result
- `status` (varchar) - Execution status (success/error/timeout)
- `error` (text) - Error message if failed
- `execution_time_ms` (integer) - Execution duration
- `created_at` (timestamp)

## Usage

### Connection

```typescript
import { db, getClient, testConnection } from './db/connection';

// Test connection
const isConnected = await testConnection();

// Use Drizzle ORM
const conversations = await db.query.conversations.findMany();

// Use raw SQL (via Bun.sql)
const client = getClient();
const result = await client`SELECT * FROM conversations LIMIT 10`;
```

### Querying with Drizzle

```typescript
import { db } from './db/connection';
import { conversations, messages } from './db/schema';
import { eq } from 'drizzle-orm';

// Create a conversation
const [conversation] = await db
  .insert(conversations)
  .values({
    title: 'My Conversation',
    systemPrompt: 'You are helpful',
    configName: 'default',
  })
  .returning();

// Insert messages
await db.insert(messages).values({
  conversationId: conversation.id,
  role: 'user',
  content: 'Hello!',
  sequence: 0,
});

// Query with relations
const conv = await db.query.conversations.findFirst({
  where: eq(conversations.id, conversationId),
  with: {
    messages: {
      orderBy: (messages, { asc }) => [asc(messages.sequence)],
    },
  },
});
```

## Migration Commands

```bash
# Generate migrations from schema changes
bun drizzle-kit generate

# Apply migrations (using our custom script)
bun src/db/migrate.ts

# Or use drizzle-kit push (interactive)
bun drizzle-kit push

# Open Drizzle Studio (database GUI)
bun drizzle-kit studio
```

## Testing

```bash
# Test database connection
bun src/db/test-connection.ts

# Test schema operations (CRUD)
bun src/db/test-schema.ts
```

## Environment Variables

Configure in `.env`:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

## Performance Features

Bun's native SQL driver provides:
- **Zero dependencies** - Built into Bun runtime
- **Automatic connection pooling** - Configurable max connections
- **Prepared statements** - Automatic query optimization
- **Query pipelining** - Batch query execution
- **Structure caching** - Fast repeated queries
- **Up to 50% faster** than traditional Node.js Postgres clients

## Design Decisions

1. **UUIDs for primary keys** - Better for distributed systems and prevents enumeration
2. **JSONB for flexible data** - Model params, metadata, tool calls
3. **Sequence numbers** - Explicit ordering of messages (better than relying on timestamps)
4. **Soft deletes** - `deleted_at` field for conversations
5. **Cascade deletes** - Messages deleted when conversation is deleted
6. **Token tracking** - Optional field for cost/usage analytics
7. **Tool execution logs** - Separate table for debugging and analytics

## Next Steps

To integrate with the `Conversation` class:
1. Create a `ConversationRepository` class
2. Implement save/load methods
3. Consider using hooks for auto-persistence
4. Add transaction support for multi-message operations
