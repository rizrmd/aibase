# Quick Reference: Chat Architecture

## Key Paths to Know

### Frontend Core
- **Zustand Store (Messages)**: `/frontend/src/stores/chat-store.ts`
- **Chat Hook**: `/frontend/src/hooks/use-chat.ts`
- **WebSocket Client**: `/frontend/src/lib/ws/ws-client.ts`
- **Conversation ID**: `/frontend/src/lib/conv-id.ts`
- **Message Types**: `/frontend/src/components/ui/chat/messages/types.ts`
- **Message Persistence (localStorage)**: `/frontend/src/lib/message-persistence.ts`

### Backend Core
- **WebSocket Server**: `/backend/src/ws/entry.ts` (WSServer class)
- **Conversation Logic**: `/backend/src/llm/conversation.ts`
- **Message Persistence (in-memory)**: `/backend/src/ws/msg-persistance.ts`
- **File Storage**: `/backend/src/storage/file-storage.ts`
- **Token Tracking**: `/backend/src/llm/conversation-info.ts`
- **HTTP/WS Server**: `/backend/src/server/index.ts`

### Data
- **Conversations**: `/backend/data/A1/[convId]/`
- **Project Memory**: `/backend/data/A1/memory.json`

---

## How to Find Things

### "Where is the conversation history stored?"
1. **Frontend**: `localStorage['chat_messages']` in browser
2. **Backend (in-memory)**: `MessagePersistence` singleton in `/backend/src/ws/msg-persistance.ts`
3. **Backend (files)**: `/backend/data/A1/[convId]/` directory (todos.json, info.json)
4. **Currently**: No persistent conversation history JSON file

### "How do messages flow between frontend and backend?"
1. User types message → `useChatStore.setMessages()`
2. `handleSubmit()` in `use-chat.ts` → `WSClient.sendMessage()`
3. WebSocket sends `user_message` type message
4. Backend's `handleUserMessage()` → `Conversation.sendMessage()`
5. Streaming chunks sent as `llm_chunk` messages
6. When complete, `llm_complete` message sent
7. Frontend receives chunks, updates `currentMessageRef` and store

### "How does a new client get previous messages?"
1. Client connects with `?convId=[id]` in URL
2. Backend `handleConnectionOpen()` loads from `MessagePersistence.getClientHistory(convId)`
3. Backend sends `control_response` with `history` field
4. Client receives history and updates Zustand store

### "Where are conversation IDs generated?"
- **Frontend**: `ConvIdManager.generateConvId()` in `/frontend/src/lib/conv-id.ts`
- **Format**: `conv_[timestamp]_[randomString]`
- **Storage**: `localStorage['ws_conv_id']`
- **Sent to backend**: Via URL parameter `?convId=[id]`

### "How are files stored?"
- **Uploaded files**: `/backend/data/A1/[convId]/files/[filename_timestamp]`
- **Upload handler**: `/backend/src/server/upload-handler.ts`
- **File storage class**: `FileStorage` in `/backend/src/storage/file-storage.ts`

### "Where is tool execution managed?"
- **Tool definitions**: `/backend/src/tools/definition/[tool-name].ts`
- **Tool registry**: `getBuiltinTools()` function
- **Tool execution hooks**: In `Conversation.createConversation()` → `hooks.tools.before/after`
- **Broadcasting tool calls**: `WSServer.broadcastToConv()` with type `tool_call`/`tool_result`

### "How are todos managed?"
- **Todo storage**: `/backend/data/A1/[convId]/todos.json`
- **Todo tool**: `/backend/src/tools/definition/todo-tool.ts`
- **Broadcasting todos**: `broadcastTodoUpdate()` in WSServer
- **Frontend display**: `/frontend/src/components/todo-panel.tsx`

---

## Important Concepts

### Conversation ID vs Project ID
- **Conversation ID (convId)**: Unique per chat session, generated client-side
- **Project ID**: Currently hardcoded as `"A1"`, organizes all conversations
- **Path format**: `/data/[projectId]/[convId]/`

### Message Types (Frontend vs Backend)
- **Frontend**: `Message` interface with id, role, content, createdAt, etc.
- **Backend**: `ChatCompletionMessageParam` from OpenAI SDK
- **WebSocket**: `WSMessage` wrapper with type, id, data, metadata

### Storage Layers
1. **localStorage**: Client-side, limited to 1000 messages
2. **In-memory**: `MessagePersistence` on server, lost on restart
3. **File system**: `data/A1/[convId]/` - todos.json, info.json
4. **Not implemented**: Persistent database for full conversation history

### Connection Flow
```
Frontend connects → URL: ws://localhost:5040/api/ws?convId=[id]
                → WSClient extracts convId, sends connection request
Backend receives → Creates ConnectionInfo, loads history
                → Creates/retrieves Conversation instance
                → Sends welcome message + accumulated chunks
Frontend updates → Loads history from backend, ready for messages
```

---

## Common Tasks

### To add a new message to the conversation
1. **Frontend**: `useChatStore.addMessage(newMessage)`
2. **Backend** (auto): Conversation.addMessage() → persisted to MessagePersistence

### To persist conversation history to disk
**Currently missing!** Need to:
1. Create `/backend/data/A1/[convId]/history.json`
2. Hook into `MessagePersistence.setClientHistory()` to save to file
3. Load from file on startup

### To make Project ID dynamic
1. Extract from URL or environment variable
2. Pass through `ConversationOptions` in backend
3. Update `WSServer.createConversation()` to use dynamic projectId
4. Update file paths in `FileStorage`

### To implement user authentication
1. Add userId to Conversation tracking
2. Extract from WebSocket auth headers or token
3. Organize data as `/data/[projectId]/[userId]/[convId]/`
4. Add user filtering to history queries

---

## Debug Tips

### Check active connections
- Backend: `WSServer.getConnectionInfo()` returns all active convIds
- Look at `this.connections` Map in WSServer

### Check message persistence
- Backend: `MessagePersistence.getInstance().getStats()`
- Frontend: `MessagePersistence.getStoredMessagesInfo()`

### Check file storage
- Backend: `FileStorage.getInstance().listFiles(convId)`
- Frontend: Check localStorage for message attachments

### Monitor WebSocket messages
- Frontend: Enable network tab in DevTools
- Backend: Check console logs in `handleMessage()` and `processMessage()`

### Check streaming state
- Backend: `streamingManager.getActiveStreamsForConv(convId)`
- View: List of active streaming responses

---

## File Organization Guide

If you need to modify the architecture:

**To change how messages are stored:**
- Frontend: Edit `/frontend/src/lib/message-persistence.ts`
- Backend: Edit `/backend/src/ws/msg-persistance.ts`

**To change WebSocket message types:**
- Modify `/backend/src/ws/types.ts`
- Update `/frontend/src/lib/types/model.ts`

**To add a new feature:**
1. Define message type in `types.ts`
2. Add handler in WebSocket server (`entry.ts`)
3. Add client handler in `use-chat.ts` hook
4. Update UI components as needed

**To modify conversation initialization:**
- Frontend: `/frontend/src/hooks/use-chat.ts` (connection logic)
- Backend: `/backend/src/ws/entry.ts` (handleConnectionOpen)

---

## Current Status

- **Working**: Real-time chat, streaming responses, file uploads, tool calling
- **Partial**: Message history (in-memory, not persisted to disk)
- **Missing**: Persistent conversation history to JSON/database
- **Hardcoded**: Project ID as "A1"
- **Not implemented**: Multi-user support, authentication

