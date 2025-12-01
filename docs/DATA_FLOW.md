# Data Flow Diagrams - AiBase Chat Architecture

## 1. User Message to LLM Response Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. User types & submits message                                       │
│     ↓                                                                   │
│  2. handleSubmit() in useChat hook                                     │
│     ↓                                                                   │
│  3. Create Message object with:                                        │
│     - id: "user_[timestamp]"                                           │
│     - role: "user"                                                     │
│     - content: input text                                              │
│     - createdAt: Date                                                  │
│     ↓                                                                   │
│  4. useChatStore.setMessages([...messages, newMessage])               │
│     (Updates Zustand store)                                            │
│     ↓                                                                   │
│  5. MessagePersistence.saveMessages(messages)                          │
│     (Saves to localStorage with key: 'chat_messages')                  │
│     ↓                                                                   │
│  6. WSClient.sendMessage(text, {fileIds})                             │
│     (Sends over WebSocket)                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 ↓
                         WEBSOCKET CONNECTION
                    ws://localhost:5040/api/ws?convId=[id]
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKEND (Bun WebSocket Server)                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. handleMessage() receives WSMessage                                 │
│     - type: "user_message"                                             │
│     - data: { text: "...", fileIds: [...] }                           │
│     ↓                                                                   │
│  2. handleUserMessage() processes message                              │
│     - Sets connectionInfo.isProcessing = true                         │
│     ↓                                                                   │
│  3. Conversation.sendMessage(text)                                     │
│     - Adds user message to conversation.history                        │
│     - Calls OpenAI API with streaming                                  │
│     ↓                                                                   │
│  4. For each streaming chunk:                                          │
│     a. streamingManager.addChunk(convId, msgId, chunk)                │
│     b. broadcastToConv(convId, llm_chunk message)                     │
│     c. updateMessage in MessagePersistence                             │
│     ↓                                                                   │
│  5. When streaming complete:                                           │
│     - streamingManager.completeStream(convId, msgId)                  │
│     - broadcastToConv(convId, llm_complete message)                   │
│     - messagePersistence.setClientHistory(convId, fullHistory)        │
│     - updateTokenUsage(convId, tokens)                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 ↓
                         WEBSOCKET BROADCAST
                    All connected clients for convId
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React) - Receiving Response                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. WSClient receives 'llm_chunk' events                               │
│     ↓                                                                   │
│  2. handleLLMChunk() accumulates chunks                                │
│     currentMessageRef.current += chunk                                 │
│     ↓                                                                   │
│  3. Updates Zustand store with partial message                         │
│     setMessages(prev => prev.map(msg =>                               │
│       msg.id === currentMessageIdRef ? {...msg, content: accum} : msg  │
│     ))                                                                 │
│     ↓                                                                   │
│  4. MessagePersistence.saveMessages() auto-saves                       │
│     (useEffect watches messages array)                                 │
│     ↓                                                                   │
│  5. UI re-renders with streaming content                               │
│                                                                         │
│  6. WSClient receives 'llm_complete'                                   │
│     ↓                                                                   │
│  7. handleLLMComplete() finalizes message                              │
│     setMessages(prev => prev.map(msg =>                               │
│       msg.id === msgId ? {...msg, content: fullText} : msg             │
│     ))                                                                 │
│     ↓                                                                   │
│  8. Message finalized, setIsLoading(false)                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. New Client Connection and History Load Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React) - Initialization                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. useChat hook initializes                                           │
│     ↓                                                                   │
│  2. ConvIdManager.getConvId()                                          │
│     - Check localStorage['ws_conv_id']                                 │
│     - If exists: use it                                                │
│     - If not: generate new: "conv_[timestamp]_[random]"               │
│     ↓                                                                   │
│  3. WSClient.connect()                                                 │
│     - URL: ws://localhost:5040/api/ws?convId=[id]                    │
│     ↓                                                                   │
│  4. WebSocket onopen event fires                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKEND (Bun WebSocket Server)                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. handleConnectionOpen() fires                                        │
│     ↓                                                                   │
│  2. Extract convId from URL parameters: ws.data.convId                │
│     ↓                                                                   │
│  3. Generate sessionId: "session_[timestamp]_[random]"                │
│     ↓                                                                   │
│  4. Load history from MessagePersistence:                              │
│     existingHistory = messagePersistence.getClientHistory(convId)     │
│     ↓                                                                   │
│  5. Create Conversation instance with:                                 │
│     - convId                                                           │
│     - projectId: "A1"                                                  │
│     - systemPrompt                                                     │
│     - initialHistory: existingHistory                                  │
│     - tools: getDefaultTools(convId)                                  │
│     ↓                                                                   │
│  6. Create ConnectionInfo object:                                      │
│     {                                                                  │
│       convId,                                                          │
│       sessionId,                                                       │
│       conversation,                                                    │
│       connectedAt: Date.now(),                                         │
│       isProcessing: false,                                             │
│       ...                                                              │
│     }                                                                  │
│     ↓                                                                   │
│  7. Hook conversation.addMessage() to persist:                         │
│     originalAddMessage = conversation.addMessage.bind()               │
│     conversation.addMessage = (msg) => {                              │
│       originalAddMessage(msg)                                         │
│       messagePersistence.setClientHistory(convId, history)            │
│     }                                                                  │
│     ↓                                                                   │
│  8. Send accumulated chunks from active streams                        │
│     for (activeStream of activeStreams):                              │
│       sendToWebSocket(ws, {                                           │
│         type: 'llm_chunk',                                            │
│         data: { chunk: stream.fullResponse, isAccumulated: true }     │
│       })                                                               │
│     ↓                                                                   │
│  9. Send welcome/connected message:                                    │
│     sendToWebSocket(ws, {                                             │
│       type: 'status',                                                 │
│       data: { status: 'connected', convId, sessionId }                │
│     })                                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React) - History Loading                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Receive 'status' message → setConnectionStatus('connected')       │
│     ↓                                                                   │
│  2. Emit 'get_history' control message                                 │
│     WSClient.sendMessage with control: { type: 'get_history' }        │
│     ↓                                                                   │
│  3. Receive 'control_response' with history                            │
│     ↓                                                                   │
│  4. Update Zustand store:                                              │
│     setMessages(history.map(msg => convertToFrontendFormat(msg)))     │
│     ↓                                                                   │
│  5. Load todos if present                                              │
│     ↓                                                                   │
│  6. UI renders with full conversation history                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. File Upload Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React) - File Selection                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. User selects file via file input                                   │
│     ↓                                                                   │
│  2. handleSubmit() receives options.experimental_attachments            │
│     ↓                                                                   │
│  3. uploadFiles(files) HTTP call                                        │
│     POST /api/upload                                                   │
│     multipart/form-data with files and convId                          │
│     ↓                                                                   │
│  4. Receive response with uploaded file metadata:                       │
│     [{                                                                 │
│       id: "[fileName]_[timestamp]",                                    │
│       name: "file.pdf",                                                │
│       size: 1024,                                                      │
│       type: "application/pdf",                                         │
│       url: "/api/download/[id]"                                       │
│     }]                                                                 │
│     ↓                                                                   │
│  5. Include fileIds in message:                                         │
│     WSClient.sendMessage(text, { fileIds: [...] })                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKEND (Bun HTTP Server)                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. POST /api/upload handler                                           │
│     ↓                                                                   │
│  2. handleFileUpload() processes multipart form                         │
│     ↓                                                                   │
│  3. Extract convId from form                                           │
│     ↓                                                                   │
│  4. For each file:                                                      │
│     - FileStorage.saveFile(                                            │
│         convId,                                                        │
│         fileName,                                                      │
│         fileBuffer,                                                    │
│         mimeType,                                                      │
│         projectId: "A1"                                               │
│       )                                                                │
│     ↓                                                                   │
│  5. File saved to:                                                      │
│     /data/A1/[convId]/files/[fileName]_[timestamp]                   │
│     ↓                                                                   │
│  6. Return JSON with file metadata:                                     │
│     {                                                                  │
│       id: "[fileName]_[timestamp]",                                    │
│       name: fileName,                                                  │
│       size: fileSize,                                                  │
│       type: mimeType,                                                  │
│       url: `/api/download/[fileName]_[timestamp]`                     │
│     }                                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Tool Execution and Broadcasting Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKEND (Conversation LLM)                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. OpenAI API returns tool_calls in response                          │
│     ↓                                                                   │
│  2. Conversation.executeToolCalls(toolCalls)                           │
│     ↓                                                                   │
│  3. For each tool call:                                                 │
│     a. Get tool from registry                                          │
│     b. Call hooks.tools.before(toolCallId, toolName, args)            │
│     c. tool.execute(args)                                              │
│     d. Call hooks.tools.after(toolCallId, toolName, args, result)     │
│     e. Add tool result to history                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKEND (WSServer Tool Hooks)                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. hooks.tools.before() triggered                                      │
│     ↓                                                                   │
│  2. broadcastToConv(convId, {                                          │
│       type: 'tool_call',                                               │
│       id: toolCallId,                                                  │
│       data: {                                                          │
│         toolCallId,                                                    │
│         toolName,                                                      │
│         args,                                                          │
│         status: 'executing',                                           │
│         assistantMessageId                                             │
│       }                                                                │
│     })                                                                 │
│     ↓                                                                   │
│  3. Tool executes...                                                    │
│     ↓                                                                   │
│  4. hooks.tools.after() triggered                                       │
│     ↓                                                                   │
│  5. broadcastToConv(convId, {                                          │
│       type: 'tool_result',                                             │
│       id: toolCallId,                                                  │
│       data: {                                                          │
│         toolCallId,                                                    │
│         toolName,                                                      │
│         result                                                         │
│       }                                                                │
│     })                                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React) - Tool Visualization                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. WSClient receives 'tool_call' message                               │
│     ↓                                                                   │
│  2. Handle in useChat hook or create handler                           │
│     ↓                                                                   │
│  3. Display tool call indicator (thinking/executing)                    │
│     ↓                                                                   │
│  4. WSClient receives 'tool_result'                                     │
│     ↓                                                                   │
│  5. Update tool invocation with result                                  │
│     ↓                                                                   │
│  6. Render tool result in message                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Persistence Points in the System

```
Entry Point               Storage Layer           Location
───────────────────────────────────────────────────────────────
User Message Input
    ↓
    └─→ Zustand Store      ← In-Memory (Frontend)
            ↓
            └─→ localStorage  ← Browser Storage (Frontend)
                    ↓
                    └─→ WebSocket Send

WebSocket Receive (Backend)
    ↓
    └─→ MessagePersistence ← In-Memory (Backend)
            ↓
            └─→ Conversation.history ← In-Memory (Backend)

LLM Response Complete
    ↓
    └─→ MessagePersistence.setClientHistory()
            ↓
            └─→ (Only in-memory, NO disk save!)

File Uploads
    ↓
    └─→ FileStorage.saveFile()
            ↓
            └─→ /data/A1/[convId]/files/ ← Disk

Todo Updates
    ↓
    └─→ TodoTool persists
            ↓
            └─→ /data/A1/[convId]/todos.json ← Disk

Token Usage
    ↓
    └─→ updateTokenUsage()
            ↓
            └─→ /data/A1/[convId]/info.json ← Disk
```

---

## 6. Message State Transitions

```
Frontend Message State:
┌──────────────┐
│  Not Sent    │  (in user input)
└──────┬───────┘
       │ handleSubmit()
       ↓
┌──────────────────┐
│  Pending/Sending │  (in Zustand, waiting for server response)
└──────┬───────────┘
       │ Receive llm_chunk
       ↓
┌──────────────────┐
│  Streaming       │  (receiving parts of response)
│  (In Progress)   │  
└──────┬───────────┘
       │ Receive llm_complete
       ↓
┌──────────────────┐
│  Complete        │  (final response received)
└──────────────────┘

Backend Message State:
┌──────────────┐
│  Received    │  (user message arrives via WS)
└──────┬───────┘
       │ Add to Conversation.history
       ↓
┌──────────────────────┐
│  In Conversation     │  (added to LLM context)
│  History             │
└──────┬───────────────┘
       │ LLM calls OpenAI
       ↓
┌──────────────────────┐
│  Streaming Response  │  (LLM response streaming)
└──────┬───────────────┘
       │ Complete chunk received
       ↓
┌──────────────────────┐
│  Response Complete   │  (full response accumulated)
└──────┬───────────────┘
       │ Save to MessagePersistence
       ↓
┌──────────────────────┐
│  Persisted           │  (in-memory only! NOT on disk)
└──────────────────────┘
```

---

## 7. Storage Location Reference

```
STORAGE LAYER          IMPLEMENTATION                   LOCATION/SCOPE
─────────────────────────────────────────────────────────────────────
Frontend
  Message History      localStorage                    Key: "chat_messages"
  Conversation ID      localStorage                    Key: "ws_conv_id"
  Current State        Zustand (useChatStore)         In-memory React

Backend (Server Memory)
  Message History      MessagePersistence (Map)       Lost on restart
  Active Connections   WSServer.connections           In-memory Map
  Streaming Chunks     StreamingManager                In-memory Map
  Conversation         Conversation.history           In-memory Array

Backend (File System)
  Conversation Dir     /data/A1/[convId]/             Created dynamically
  Todo Items          todos.json                      Per-conversation
  Token Usage         info.json                       Per-conversation
  User Files          files/[name]_[timestamp]        Per-conversation
  Project Memory      /data/A1/memory.json            Per-project

MISSING!
  Full History        (Should be in history.json)    /data/A1/[convId]/
```

---

## 8. WebSocket Message Types Flow

```
CLIENT → SERVER
┌────────────────────┐
│ user_message       │ Text + optional fileIds
├────────────────────┤
│ control            │ abort, pause, resume, etc
├────────────────────┤
│ ping               │ Keep-alive
└────────────────────┘

SERVER → CLIENT  
┌────────────────────┐
│ llm_chunk          │ Streaming response text
├────────────────────┤
│ llm_complete       │ Full response finished
├────────────────────┤
│ tool_call          │ Tool execution started
├────────────────────┤
│ tool_result        │ Tool execution result
├────────────────────┤
│ todo_update        │ Todo list changed
├────────────────────┤
│ status             │ Connection status
├────────────────────┤
│ control_response   │ Response to control message
├────────────────────┤
│ error              │ Error occurred
├────────────────────┤
│ pong               │ Response to ping
└────────────────────┘
```

