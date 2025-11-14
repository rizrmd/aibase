# oRPC + WebSocket Conversation Server

A type-safe API server built with oRPC and Bun's WebSocket for real-time AI conversations.

## Features

- **Type-safe HTTP API** using oRPC
- **Real-time streaming** via WebSocket
- **End-to-end type safety** from server to client
- **Built on Bun** for maximum performance
- **Zod validation** for runtime type checking

## Architecture

```
src/orpc/
├── procedures/
│   └── conversation.ts    # Conversation management procedures
├── router.ts              # Main oRPC router
├── server.ts              # Bun server with WebSocket
├── client.ts              # Client examples
└── README.md              # This file
```

## Getting Started

### 1. Start the Server

```bash
# Development mode with hot reload
bun --hot src/orpc/server.ts

# Or add to package.json scripts
bun run orpc:dev
```

The server will start on `http://localhost:3000` with:
- HTTP endpoints at `/orpc/*`
- WebSocket at `/ws`
- Health check at `/health`

### 2. HTTP Client Usage (Non-streaming)

```typescript
import { createClient } from './orpc/client';

const client = createClient('http://localhost:3000');

// Create a conversation
await client.conversation.create({
  conversationId: 'chat-123',
  systemPrompt: 'You are a helpful assistant.',
  temperature: 0.7,
});

// Send a message (non-streaming)
const result = await client.conversation.sendMessage({
  conversationId: 'chat-123',
  message: 'Hello!',
});
console.log(result.response);

// Get history
const history = await client.conversation.getHistory({
  conversationId: 'chat-123',
});

// List all conversations
const list = await client.conversation.list();

// Clear history
await client.conversation.clearHistory({
  conversationId: 'chat-123',
  keepSystemPrompt: true,
});

// Delete conversation
await client.conversation.delete({
  conversationId: 'chat-123',
});
```

### 3. WebSocket Client Usage (Streaming)

```typescript
import { ConversationWSClient } from './orpc/client';

// Create WebSocket client
const ws = new ConversationWSClient(
  'chat-456',                    // conversationId
  'ws://localhost:3000/ws',      // WebSocket URL
  {
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
  }
);

// Connect
await ws.connect();

// Option 1: Get full response (simpler)
const response = await ws.sendMessageSync('Tell me a joke');
console.log(response);

// Option 2: Stream chunks (for real-time display)
for await (const chunk of await ws.sendMessage('Write a story')) {
  process.stdout.write(chunk); // Display each chunk as it arrives
}

// Listen to all messages
ws.on((data) => {
  console.log('Received:', data);
});

// Ping server
ws.ping();

// Check connection
if (ws.isConnected()) {
  console.log('Connected!');
}

// Disconnect
ws.disconnect();
```

## API Reference

### HTTP Endpoints (via oRPC)

#### `conversation.create`
Create a new conversation or configure an existing one.

**Input:**
```typescript
{
  conversationId: string;
  systemPrompt?: string;
  temperature?: number;    // 0-2
  maxTokens?: number;
  configName?: string;     // AI config name from ai.json
}
```

**Output:**
```typescript
{
  conversationId: string;
  created: boolean;
  historyLength: number;
}
```

#### `conversation.sendMessage`
Send a message and get the full response (non-streaming).

**Input:**
```typescript
{
  conversationId: string;
  message: string;
}
```

**Output:**
```typescript
{
  conversationId: string;
  response: string;
  historyLength: number;
}
```

#### `conversation.getHistory`
Get conversation history.

**Input:**
```typescript
{
  conversationId: string;
}
```

**Output:**
```typescript
{
  conversationId: string;
  history: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }>;
  exists: boolean;
}
```

#### `conversation.clearHistory`
Clear conversation history.

**Input:**
```typescript
{
  conversationId: string;
  keepSystemPrompt?: boolean; // default: true
}
```

**Output:**
```typescript
{
  conversationId: string;
  cleared: boolean;
  historyLength: number;
}
```

#### `conversation.delete`
Delete a conversation.

**Input:**
```typescript
{
  conversationId: string;
}
```

**Output:**
```typescript
{
  conversationId: string;
  deleted: boolean;
}
```

#### `conversation.list`
List all active conversations.

**Output:**
```typescript
{
  conversations: Array<{
    conversationId: string;
    historyLength: number;
    tools: number;
  }>;
  total: number;
}
```

### WebSocket Protocol

#### Client → Server Messages

**Initialize:**
```json
{
  "type": "init",
  "conversationId": "chat-123",
  "config": {
    "systemPrompt": "You are helpful",
    "temperature": 0.7,
    "maxTokens": 2000
  }
}
```

**Send Message:**
```json
{
  "type": "message",
  "message": "Hello, world!"
}
```

**Ping:**
```json
{
  "type": "ping"
}
```

#### Server → Client Messages

**Init Confirmation:**
```json
{
  "type": "init",
  "conversationId": "chat-123",
  "historyLength": 0
}
```

**Streaming Chunk:**
```json
{
  "type": "chunk",
  "conversationId": "chat-123",
  "chunk": "Hello",
  "fullText": "Hello"
}
```

**Stream End:**
```json
{
  "type": "end",
  "conversationId": "chat-123",
  "fullText": "Hello, how can I help you?",
  "historyLength": 2
}
```

**Error:**
```json
{
  "type": "error",
  "error": "Error message",
  "conversationId": "chat-123"
}
```

**Pong:**
```json
{
  "type": "pong"
}
```

## Advanced Usage

### Custom Tools

You can add custom tools to conversations:

```typescript
import { Tool, Conversation } from '../llm/conversation';

class WeatherTool extends Tool {
  name = 'get_weather';
  description = 'Get the current weather for a location';
  parameters = {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
    },
    required: ['location'],
  };

  async execute(args: { location: string }) {
    // Implement weather fetching
    return { temperature: 72, condition: 'sunny' };
  }
}

// In your procedure, register the tool:
const conversation = new Conversation({
  tools: [new WeatherTool()],
});
```

### Conversation Hooks

Monitor and control conversation flow:

```typescript
const conversation = new Conversation({
  hooks: {
    message: {
      before: async (message, history) => {
        console.log('Sending:', message);
      },
      chunk: async (chunk, fullText) => {
        console.log('Received chunk:', chunk);
      },
      end: async (fullText) => {
        console.log('Complete response:', fullText);
      },
    },
    tools: {
      before: async (id, name, args) => {
        console.log(`Calling tool ${name}:`, args);
      },
      after: async (id, name, args, result) => {
        console.log(`Tool ${name} result:`, result);
      },
    },
  },
});
```

## Testing

### Manual Testing with curl

```bash
# Health check
curl http://localhost:3000/health

# Create conversation
curl -X POST http://localhost:3000/orpc/conversation.create \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "test-1",
    "systemPrompt": "You are helpful",
    "temperature": 0.7
  }'

# Send message
curl -X POST http://localhost:3000/orpc/conversation.sendMessage \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "test-1",
    "message": "Hello!"
  }'

# Get history
curl -X POST http://localhost:3000/orpc/conversation.getHistory \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "test-1"
  }'

# List conversations
curl -X POST http://localhost:3000/orpc/conversation.list
```

### WebSocket Testing

You can test WebSocket using a simple client:

```typescript
// test-ws.ts
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // Initialize
  ws.send(JSON.stringify({
    type: 'init',
    conversationId: 'test-ws-1',
    config: { systemPrompt: 'You are helpful' },
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);

  // After init, send a message
  if (data.type === 'init') {
    ws.send(JSON.stringify({
      type: 'message',
      message: 'Hello!',
    }));
  }
};
```

Run with: `bun test-ws.ts`

## Production Considerations

1. **Persistence**: Currently conversations are stored in memory. For production:
   - Use Redis for conversation state
   - Use a database for conversation history
   - Implement conversation TTL/expiration

2. **Authentication**: Add authentication middleware:
   ```typescript
   // In server.ts fetch handler
   const token = req.headers.get('authorization');
   if (!isValidToken(token)) {
     return new Response('Unauthorized', { status: 401 });
   }
   ```

3. **Rate Limiting**: Implement rate limiting for both HTTP and WebSocket

4. **Monitoring**: Add logging and metrics:
   - Track active WebSocket connections
   - Monitor conversation counts
   - Log errors and performance metrics

5. **Scaling**:
   - Use a Redis pub/sub for multi-server WebSocket support
   - Load balance HTTP requests
   - Consider using a WebSocket gateway

## Type Safety

The entire stack is fully type-safe:

```typescript
// Server exports AppRouter type
export type AppRouter = typeof router;

// Client imports and uses it
const client = createORPCClient<AppRouter>(link);

// TypeScript knows all available methods and their types
client.conversation.sendMessage({
  conversationId: 'abc', // ✅ Type-checked
  message: 'hello',      // ✅ Type-checked
  foo: 'bar'            // ❌ Error: 'foo' doesn't exist
});
```

## License

ISC
