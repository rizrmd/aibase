# Persisted Conversations in WebSocket

All conversations are now automatically persisted to the database using PostgreSQL. This means conversations survive server restarts and can be accessed across multiple connections.

## How It Works

### Auto-Save on Every Message

Conversations are automatically saved to the database when:
- A new conversation is created
- A user sends a message
- The AI responds
- Tool calls are executed

The persistence happens through **hooks** in the `Conversation` class that trigger whenever the history changes.

### Database Tables

Three tables store conversation data:

1. **`conversation`** - Stores conversation metadata
   - `id` (UUID) - Conversation identifier
   - `userId` (string) - Optional user ID
   - `title` (text) - Auto-generated or custom title
   - `systemPrompt` (text) - System prompt
   - `configName` (string) - AI config name
   - `modelParams` (jsonb) - Temperature, maxTokens, etc.
   - `createdAt`, `updatedAt`, `deletedAt` - Timestamps

2. **`conversation_message`** - Stores individual messages
   - `id` (UUID) - Message identifier
   - `conversationId` (UUID) - Foreign key to conversation
   - `role` (enum) - 'system', 'user', 'assistant', 'tool'
   - `content` (text) - Message content
   - `toolCalls` (jsonb) - Tool calls for assistant messages
   - `toolCallId` (string) - Tool call ID for tool responses
   - `sequence` (int) - Message order within conversation

3. **`conversation_tools`** - Stores tool execution logs (for analytics)

## WebSocket Usage

### Connecting to an Existing Conversation

When you connect via WebSocket with a `conversationId`, the system:

1. Checks if the conversation exists in memory cache
2. If not in cache, loads from database
3. Restores full conversation history
4. Sets up auto-save hooks for new messages

```typescript
const ws = new ConversationWSClient('my-conversation-id');
await ws.connect();

// Conversation history is automatically loaded!
// Continue from where you left off
await ws.sendMessageSync('What were we talking about?');
```

### Creating a New Conversation

```typescript
const ws = new ConversationWSClient('new-conversation-123', 'ws://localhost:3000/ws', {
  systemPrompt: 'You are a helpful assistant',
  temperature: 0.7,
});

await ws.connect();
// Conversation is automatically saved to database
```

### Message Flow

```
User sends message
    ↓
Message added to conversation history
    ↓
History hook triggered
    ↓
New messages saved to database
    ↓
AI generates response
    ↓
Response added to history
    ↓
History hook triggered again
    ↓
AI response saved to database
```

## HTTP API with Persistence

All HTTP endpoints also use persistence:

```typescript
import { createClient } from './orpc/client';

const client = createClient('http://localhost:3000');

// Create conversation (saved to DB)
await client.conversation.create({
  conversationId: 'chat-123',
  systemPrompt: 'You are helpful',
});

// Send message (both user message and AI response saved to DB)
await client.conversation.sendMessage({
  conversationId: 'chat-123',
  message: 'Hello!',
});

// Get history (loaded from DB if not in memory)
const history = await client.conversation.getHistory({
  conversationId: 'chat-123',
});

// List all conversations (from DB)
const list = await client.conversation.list({
  userId: 'optional-user-id',
  limit: 50,
});
```

## Performance Considerations

### Memory Cache

Active conversations are kept in memory for fast access. The system uses a two-tier approach:

1. **Memory (Map)** - Fast access for active conversations
2. **Database** - Persistent storage

When a conversation is accessed:
- First check memory cache
- If not in cache, load from database
- Keep in memory for subsequent requests

### Auto-Save Optimization

Messages are only saved if they're new:

```typescript
hooks: {
  history: async (history) => {
    const currentCount = await conversationService.getMessageCount(conversationId);
    const newMessages = history.slice(currentCount);

    // Only save new messages
    if (newMessages.length > 0) {
      await conversationService.addMessages(conversationId, newMessages);
    }
  },
}
```

### Title Auto-Generation

After the first user message, a title is automatically generated:

```typescript
// Takes first 50 characters of first user message
await conversationService.autoGenerateTitle(conversationId);
```

## Conversation Lifecycle

### 1. Creation
```typescript
// WebSocket
await ws.connect(); // Creates conversation in DB

// HTTP
await client.conversation.create({ conversationId: '...' });
```

### 2. Active Usage
- Messages automatically saved as they're added
- Conversation `updatedAt` timestamp updated on each message

### 3. Persistence Across Restarts
```typescript
// Server restarts...

// Reconnect with same conversationId
const ws = new ConversationWSClient('my-conversation-id');
await ws.connect();
// Full history restored from database!
```

### 4. Cleanup
```typescript
// Soft delete (marks deletedAt timestamp)
await client.conversation.delete({ conversationId: '...' });
```

## Service Layer

The `ConversationPersistenceService` (`src/db/conversation-service.ts`) provides:

- `createConversation()` - Create new conversation
- `getConversation()` - Get conversation metadata
- `getMessages()` - Get all messages
- `addMessage()` - Add single message
- `addMessages()` - Add multiple messages
- `clearMessages()` - Clear history (optionally keep system prompt)
- `deleteConversation()` - Soft delete
- `listConversations()` - List with optional filtering
- `loadFullConversation()` - Load conversation + all messages
- `autoGenerateTitle()` - Generate title from first message

## Environment Setup

Ensure your `.env` file has the database connection:

```env
DATABASE_URL=postgresql://localhost:5432/aibase
```

The database schema is already set up in `src/db/schema.ts`.

## Benefits

1. **Survive Restarts** - Conversations persist across server restarts
2. **Multi-Session** - Same conversation accessible from different connections
3. **History Retrieval** - Full conversation history always available
4. **Analytics Ready** - All data in database for future analytics
5. **User Management** - Optional userId field for multi-tenant setups
6. **Automatic** - No manual save/load calls needed

## Example: Continuing a Conversation

```typescript
// Day 1: Start a conversation
const ws1 = new ConversationWSClient('my-project-discussion');
await ws1.connect();
await ws1.sendMessageSync('Help me plan my project');
ws1.disconnect();

// Server restarts overnight...

// Day 2: Continue the same conversation
const ws2 = new ConversationWSClient('my-project-discussion');
await ws2.connect(); // Loads all previous history from DB
await ws2.sendMessageSync('What did we decide yesterday?');
// AI has full context from previous session!
```

## Testing Persistence

```bash
# Start server
bun run orpc:dev

# In another terminal, send a message
bun run orpc:example

# Stop the server (Ctrl+C)

# Start server again
bun run orpc:dev

# Reconnect with same conversationId
# Full history will be restored!
```
