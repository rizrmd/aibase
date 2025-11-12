# AI Conversation Backend

A real-time WebSocket conversation backend using Bun and the `@openai/agents` SDK. Provides a complete chat interface with WebSocket support for seamless AI conversations.

## Features

- 🚀 **WebSocket Server** - Real-time bidirectional communication using Bun's native WebSocket API
- 🤖 **OpenAI Agents SDK** - Powered by the official OpenAI Agents SDK
- 💬 **Conversation State** - Maintains conversation history per connection
- 🎨 **Built-in Web UI** - Beautiful chat interface served directly from the backend
- ⚡ **Bun Runtime** - Fast, modern JavaScript runtime with native TypeScript support
- 🔄 **Auto-reconnect** - Client automatically reconnects on connection loss
- 📝 **TypeScript** - Full TypeScript support for type safety

## Prerequisites

- **Bun** (v1.0 or higher) - [Install Bun](https://bun.sh)
- **OpenAI API key** - [Get your API key](https://platform.openai.com/api-keys)

## Installation

1. Install Bun (if not already installed):
```bash
curl -fsSL https://bun.sh/install | bash
```

2. Install dependencies:
```bash
bun install
```

3. Set up your environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=your-actual-api-key
PORT=3000
```

## Usage

### WebSocket Server (Recommended)

Run the WebSocket conversation server:
```bash
bun run server
```

With hot-reload for development:
```bash
bun run server:dev
```

Then open your browser to:
- **Web Client**: http://localhost:3000/
- **Health Check**: http://localhost:3000/health
- **WebSocket Endpoint**: ws://localhost:3000/ws

### Simple CLI Demo

Run the simple command-line demo:
```bash
bun run dev
```

### Production Build

Build for production:
```bash
bun run build
```

Run the built version:
```bash
bun run start
```

## Project Structure

```
backend/
├── src/
│   ├── server.ts         # WebSocket conversation server (main)
│   └── index.ts          # Simple CLI demo
├── dist/                 # Build output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## WebSocket API

### Client -> Server Messages

```typescript
{
  type: 'message',
  content: string,
  conversationId?: string
}

{
  type: 'ping'
}
```

### Server -> Client Messages

```typescript
{
  type: 'connected',
  conversationId: string,
  timestamp: number
}

{
  type: 'message',
  content: string,
  conversationId: string,
  timestamp: number
}

{
  type: 'error',
  content: string,
  timestamp: number
}

{
  type: 'pong',
  timestamp: number
}
```

## Customization

### Customize the AI Agent

Edit the agent configuration in `src/server.ts`:

```typescript
const agent = new Agent({
  name: 'ConversationAssistant',
  instructions: 'Your custom instructions here',
  model: 'gpt-4o-mini', // or 'gpt-4o', 'gpt-4-turbo', etc.
});
```

### Change the Port

Set the `PORT` environment variable in `.env` or pass it when running:

```bash
PORT=8080 bun run server
```

## Available Scripts

- `bun run server` - Start the WebSocket server
- `bun run server:dev` - Start the server with hot-reload
- `bun run dev` - Run the simple CLI demo
- `bun run build` - Build for production
- `bun run start` - Run the production build
- `bun test` - Run tests (placeholder)

## Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `/` | HTTP GET | Web-based chat interface |
| `/ws` | WebSocket | WebSocket connection endpoint |
| `/health` | HTTP GET | Health check endpoint |

## Dependencies

- `@openai/agents` - OpenAI Agents SDK
- `openai` - OpenAI API client
- `typescript` - TypeScript compiler
- `@types/node` - Node.js type definitions

## Architecture

The backend uses Bun's native `Bun.serve()` with WebSocket support:

1. **HTTP Requests**: Serves the web UI and health check endpoint
2. **WebSocket Upgrade**: Handles WebSocket connections at `/ws`
3. **Conversation Management**: Maintains per-connection conversation history
4. **Agent Integration**: Processes messages through OpenAI Agents SDK
5. **Real-time Responses**: Streams AI responses back to clients

## License

ISC
