# AiBase Chat and Conversation Architecture Summary

## Overview
This is a **full-stack application** with both frontend and backend components using WebSocket for real-time bidirectional communication. The architecture supports conversation management, message persistence, and integration with LLM tools.

---

## 1. Project Structure

### Frontend (React + Vite)
```
/Users/riz/Developer/aibase/frontend/
├── src/
│   ├── components/
│   │   ├── ui/chat/               # Chat UI components
│   │   ├── conversation/          # Conversation components
│   │   ├── main-chat.tsx          # Main chat interface
│   │   └── app-router.tsx         # App routing
│   ├── hooks/
│   │   ├── use-chat.ts            # Main chat hook
│   │   ├── use-websocket-handlers.ts
│   │   └── others
│   ├── stores/
│   │   ├── chat-store.ts          # Zustand store for messages
│   │   ├── file-store.ts
│   │   └── other stores
│   ├── lib/
│   │   ├── ws/                    # WebSocket client logic
│   │   ├── conv-id.ts             # Conversation ID management
│   │   ├── message-persistence.ts # localStorage persistence
│   │   └── types/
│   │       └── model.ts           # Shared types
│   └── types/
│       └── memory.ts
└── package.json
```

### Backend (Bun + TypeScript)
```
/Users/riz/Developer/aibase/backend/
├── src/
│   ├── server/
│   │   ├── index.ts              # Main HTTP/WS server
│   │   ├── upload-handler.ts     # File upload endpoints
│   │   └── memory-handler.ts     # Memory management
│   ├── ws/
│   │   ├── entry.ts              # WSServer class (main handler)
│   │   ├── types.ts              # WebSocket types
│   │   ├── events.ts             # Event emitter
│   │   └── msg-persistance.ts    # In-memory message storage
│   ├── llm/
│   │   ├── conversation.ts       # Conversation class (LLM logic)
│   │   ├── conversation-info.ts  # Token usage tracking
│   │   ├── context.ts            # System context
│   │   └── postgresql-detector.ts
│   ├── tools/                    # LLM tools (file, todo, etc)
│   ├── storage/
│   │   └── file-storage.ts       # File system storage
│   └── data/                     # Runtime data directory
└── package.json
```

---

## 2. How Conversations/Chats Are Currently Stored or Managed

### Frontend Storage
**Location**: Browser `localStorage`
- **Key**: `ws_conv_id` - Stores the conversation ID
- **Key**: `chat_messages` - Stores message history (up to 1000 messages)
- **File**: `/Users/riz/Developer/aibase/frontend/src/lib/message-persistence.ts`

### Backend Storage (In-Memory + File System)

#### 2.1 In-Memory Message Storage
- **Class**: `MessagePersistence` (Singleton)
- **File**: `/Users/riz/Developer/aibase/backend/src/ws/msg-persistance.ts`
- **Storage**: Map<convId, ConvMessageHistory>
- **Data Persisted Per Conversation**:
  - Chat completion message history
  - Last updated timestamp
  - Message count

#### 2.2 File System Storage
- **Base Path**: `/Users/riz/Developer/aibase/backend/data/`
- **Structure**: `data/[projectId]/[convId]/`

**Directory Structure Example**:
```
/data/
└── A1/                                          # Project ID
    ├── memory.json                              # Shared memory for project
    └── conv_1764504882961_e9or0ruha/           # Conversation directory
        ├── todos.json                           # Todo items
        ├── info.json                            # Token usage & metadata
        └── files/                               # Uploaded user files
            └── filename_timestamp.pdf
```

---

## 3. Chat Message Definitions (Types/Interfaces)

### Frontend Message Type
**File**: `/Users/riz/Developer/aibase/frontend/src/components/ui/chat/messages/types.ts`

```typescript
interface Message {
  id: string;                                    // Unique message ID
  role: "user" | "assistant" | (string & {});  // Message sender
  content: string;                               // Message text
  createdAt?: Date;                             // Creation timestamp
  experimental_attachments?: Attachment[];      // Legacy attachments
  attachments?: UploadedFileAttachment[];       // Uploaded files
  toolInvocations?: ToolInvocation[];          // Tool calls made
  parts?: MessagePart[];                        // Message parts (text, reasoning, files)
  completionTime?: number;                      // Seconds to complete
  isThinking?: boolean;                         // Thinking indicator
  aborted?: boolean;                            // Message was cancelled
}

interface UploadedFileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
}
```

### Backend Message Type (OpenAI Format)
**From**: `openai/resources/chat/completions`
- Uses OpenAI's `ChatCompletionMessageParam` type
- Includes: role, content, tool_calls, tool_call_id, etc.

### WebSocket Message Type
**File**: `/Users/riz/Developer/aibase/backend/src/ws/types.ts`

```typescript
interface WSMessage {
  type: MessageType;                   // Message type enum
  id: string;                          // Message ID
  data?: any;                          // Message payload
  metadata?: MessageMetadata;          // Metadata (timestamp, convId, etc)
}

interface MessageMetadata {
  timestamp: number;
  sequence?: number;
  total?: number;
  convId?: string;
  sessionId?: string;
  isAccumulated?: boolean;
}

type MessageType =
  // Client to Server
  | 'user_message' | 'control' | 'ping'
  // Server to Client
  | 'llm_chunk' | 'llm_complete' | 'tool_call' | 'tool_result'
  | 'todo_update' | 'error' | 'control_response' | 'pong' | 'status';
```

---

## 4. Data Storage Mechanisms

### Frontend
- **Conversation ID Storage**: `localStorage` (key: `ws_conv_id`)
- **Message History**: `localStorage` (key: `chat_messages`)
- **Zustand Store**: In-memory state for current session

### Backend

#### Option 1: In-Memory (MessagePersistence)
- Used during active connections
- Singleton pattern
- Lost on server restart
- Per-connection conversation history

#### Option 2: File System (Persistent)
- Location: `/Users/riz/Developer/aibase/backend/data/A1/[convId]/`
- Files:
  - `todos.json` - Task management
  - `info.json` - Token usage statistics
  - `files/` - User uploaded files
  - `/data/A1/memory.json` - Shared project memory

#### Implementation Details:
- **File Storage Class**: `FileStorage` (Singleton)
- **Location**: `/Users/riz/Developer/aibase/backend/src/storage/file-storage.ts`
- Methods:
  - `saveFile(convId, fileName, buffer, type)` - Save uploaded file
  - `listFiles(convId)` - List all files for conversation
  - `deleteFile(convId, fileName)` - Delete specific file
  - `getStorageSize(convId)` - Get total storage used

---

## 5. Architecture: Frontend-Only vs Full-Stack

### This is a **Full-Stack Application**

#### Backend (Server-Side)
- **Runtime**: Bun (TypeScript runtime)
- **Port**: 5040 (default)
- **Features**:
  - WebSocket server for real-time communication
  - OpenAI integration (LLM calls)
  - Tool execution (file tools, todo, memory, scripts, etc)
  - File upload/download HTTP endpoints
  - Message history persistence
  - Token usage tracking
  - HTTP server with routing

#### Frontend (Client-Side)
- **Framework**: React 19 with Vite
- **Features**:
  - Chat UI with message rendering
  - WebSocket client connection
  - File uploads
  - Zustand state management
  - localStorage persistence

#### Communication
- **WebSocket**: Real-time bidirectional chat
- **HTTP**: File uploads/downloads
- **Connection URL**: `ws://localhost:5040/api/ws?convId=[convId]`

---

## 6. Project IDs and Conversation IDs Management

### Conversation ID (convId)
**File**: `/Users/riz/Developer/aibase/frontend/src/lib/conv-id.ts`

#### Generation & Storage
```typescript
// Format: "conv_[timestamp]_[random]"
// Example: "conv_1764504882961_e9or0ruha"

// Frontend:
class ConvIdManager {
  static getConvId(): string     // Get or generate
  static generateConvId(): string // Generate new
  static setConvId(id: string)    // Store in localStorage
  static clearConvId(): void      // Clear stored ID
}

// React Hook:
const { convId, setConvId, generateNewConvId, ... } = useConvId();
```

#### Storage
- **Frontend**: `localStorage['ws_conv_id']`
- **Backend**: Extracted from WebSocket URL parameters: `?convId=...`

### Project ID (projectId)
**Hardcoded Value**: `"A1"`
- Used in backend for organizing data: `/data/A1/[convId]/`
- Currently hardcoded as default project
- Could be made dynamic for multi-project support

#### Current File Paths
```
/data/A1/[convId]/todos.json
/data/A1/[convId]/info.json
/data/A1/[convId]/files/
/data/A1/memory.json
```

---

## 7. Message Flow and Persistence

### Message Flow Diagram

```
Frontend (React)
    |
    |-- localStorage (conv_id + messages)
    |
    |-- Zustand Store (chat-store.ts)
    |
    v
    
    WebSocket Client
    (ws-client.ts)
         |
         |-- Connect: ws://localhost:5040/api/ws?convId=[id]
         |
         v
    
    WebSocket Server (Bun)
    (entry.ts - WSServer class)
         |
         |-- MessagePersistence (in-memory)
         |-- StreamingManager (track active streams)
         |
         v
    
    Conversation (LLM Logic)
    (conversation.ts)
         |
         |-- OpenAI API calls
         |-- Tool execution
         |-- History management
         |
         v
    
    File System Storage
    (data/A1/[convId]/)
         |
         |-- todos.json
         |-- info.json
         |-- files/
```

### Persistence Points

1. **User sends message**
   - Frontend: Store in Zustand + localStorage
   - Backend: Add to Conversation history + MessagePersistence

2. **LLM responds (streaming)**
   - Backend: Accumulate chunks in StreamingManager
   - Frontend: Update message in Zustand + localStorage
   - Broadcast: All clients get the same updates

3. **Response complete**
   - Backend: Save full response to MessagePersistence + file system
   - File: `data/A1/[convId]/todos.json`, `info.json`
   - Token usage tracked in `info.json`

4. **New client connects**
   - Backend: Load history from MessagePersistence
   - Send accumulated chunks from active streams
   - Send full conversation history on "get_history" control message

---

## 8. Conversation Initialization Flow

### When new connection is established

**File**: `/Users/riz/Developer/aibase/backend/src/ws/entry.ts` (handleConnectionOpen)

```typescript
1. Extract convId from URL parameters
2. Generate unique sessionId
3. Create ConnectionInfo tracking object
4. Load existing message history from MessagePersistence.getClientHistory(convId)
5. Create Conversation instance with:
   - System prompt from context
   - Existing message history (initial setup)
   - Default tools loaded
   - ProjectId: "A1"
6. Hook addMessage() to persist to MessagePersistence
7. Send accumulated chunks from active streams
8. Send welcome status message
```

---

## 9. Key Components and Their Responsibilities

### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| `useChatStore` | `stores/chat-store.ts` | Zustand store for message state |
| `useChat` | `hooks/use-chat.ts` | Main chat logic hook |
| `WSClient` | `lib/ws/ws-client.ts` | WebSocket client |
| `ConvIdManager` | `lib/conv-id.ts` | Conv ID generation/storage |
| `MessagePersistence` | `lib/message-persistence.ts` | localStorage persistence |
| `main-chat.tsx` | `components/main-chat.tsx` | Main chat UI |
| `ChatMessage` | `components/ui/chat/messages/chat-message.tsx` | Message renderer |

### Backend Components

| Component | Path | Purpose |
|-----------|------|---------|
| `WSServer` | `ws/entry.ts` | Main WebSocket server handler |
| `Conversation` | `llm/conversation.ts` | LLM conversation orchestrator |
| `MessagePersistence` | `ws/msg-persistance.ts` | In-memory message storage |
| `StreamingManager` | `ws/entry.ts` | Tracks active response streams |
| `FileStorage` | `storage/file-storage.ts` | File system operations |
| `WebSocketServer` | `server/index.ts` | HTTP + WS server wrapper |

---

## 10. Data Directory and File Organization

### Current State
```
/Users/riz/Developer/aibase/backend/data/
├── A1/                              # Project directory
│   ├── memory.json                  # Project-wide memory
│   ├── conv_1764394110087_tpi3eu4df/
│   │   ├── files/                   # Uploaded files
│   │   │   └── MCQ*.pdf
│   │   └── todos.json               # Todo items for conversation
│   ├── conv_1764473945805_5mwkm5uuh/
│   │   ├── files/
│   │   │   └── *.pdf
│   │   └── todos.json
│   ├── conv_1764504882961_e9or0ruha/
│   │   └── todos.json
│   ├── conv_1764508180370_gcaw6d8an/
│   │   ├── info.json                # Token usage statistics
│   │   └── todos.json
│   └── ... (more conversations)
```

### File Formats

#### `info.json` (Token Usage)
```json
{
  "convId": "conv_...",
  "projectId": "A1",
  "createdAt": 1764508180370,
  "lastUpdatedAt": 1764508180370,
  "totalMessages": 5,
  "tokenUsage": {
    "total": {
      "promptTokens": 100,
      "completionTokens": 50,
      "totalTokens": 150,
      "timestamp": 1764508180370
    },
    "history": [...]
  }
}
```

#### `todos.json` (Todo Items)
```json
{
  "items": [
    {
      "id": "...",
      "text": "...",
      "completed": false,
      "createdAt": 1764504882961
    }
  ]
}
```

#### `memory.json` (Project Memory)
```json
{
  "memories": [
    {
      "id": "...",
      "content": "...",
      "createdAt": 1764...,
      "tags": [...]
    }
  ]
}
```

---

## 11. Current Limitations and Notes

1. **Project ID**: Currently hardcoded as `"A1"` - needs to be dynamic for true multi-project support
2. **Message History in Memory**: Backend relies on in-memory `MessagePersistence` - lost on server restart
   - Should implement persistent database or backup to file system
3. **Conversation History Not Persisted**: Conversation message history is stored in memory, not saved to disk
   - Need to persist full conversation history to `data/A1/[convId]/messages.json`
4. **localStorage Limit**: Frontend limits to 1000 messages to prevent overflow
5. **No User Authentication**: Current architecture doesn't track users
6. **Single Server Instance**: WebSocket state not shared across multiple server instances

---

## 12. Key File Paths Reference

### Frontend
```
/Users/riz/Developer/aibase/frontend/src/
├── stores/chat-store.ts                    # Zustand message store
├── hooks/use-chat.ts                       # Main chat logic
├── lib/
│   ├── conv-id.ts                         # Conversation ID management
│   ├── message-persistence.ts             # localStorage persistence
│   └── ws/ws-client.ts                    # WebSocket client
├── components/ui/chat/messages/types.ts   # Message types
└── main.tsx                               # App entry point
```

### Backend
```
/Users/riz/Developer/aibase/backend/src/
├── ws/entry.ts                            # WSServer class
├── ws/msg-persistance.ts                  # In-memory storage
├── llm/conversation.ts                    # Conversation logic
├── server/index.ts                        # HTTP/WS server
├── storage/file-storage.ts                # File operations
└── data/                                  # Runtime data directory
```

---

## Summary

This is a **full-stack WebSocket-based chat application** with:

- **Frontend**: React + Vite, using Zustand and localStorage
- **Backend**: Bun + TypeScript WebSocket server
- **Storage**: Hybrid (in-memory + file system)
- **Identification**: Conversation IDs generated client-side, stored in localStorage
- **Real-time**: WebSocket for streaming responses
- **Data Structure**: Project → Conversation → Messages/Todos/Files

The architecture is designed for real-time multi-user collaboration with support for tool calling, file uploads, and conversation persistence.
