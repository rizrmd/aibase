# WebSocket Streaming and Resumption Architecture

## Overview

This document explains how the backend and frontend coordinate to handle streaming LLM responses with support for reconnection and resumption. Understanding this mechanism is critical for reliability and debugging.

## Core Concepts

### 1. Conversation-Scoped Streaming

**Key Principle**: Streaming is scoped to conversations (`convId`), NOT to individual WebSocket connections.

- A conversation can persist across multiple WebSocket connections
- When a connection drops and reconnects, it can resume the conversation
- Each message within a conversation has a unique `messageId`

### 2. Message ID Synchronization

**Critical Requirement**: The backend generates message IDs, and the frontend MUST use these exact IDs.

**Why this matters**:
- Backend generates message IDs like: `msg_1764257049895_2`
- Frontend must use this EXACT ID when creating/updating messages
- If frontend generates its own ID (e.g., `msg_${Date.now()}_assistant`), the completion handler cannot find the message to update
- Result: Message truncation, duplication, or loss

**Implementation**:
```typescript
// Backend sends chunks with its message ID
{
  type: "llm_chunk",
  id: "msg_1764257049895_2",  // Backend's ID
  data: { chunk: "Hello" }
}

// Frontend MUST use this ID when creating the message
const newMessage = {
  id: data.messageId,  // Use backend's ID, not generated
  role: "assistant",
  content: data.chunk
}
```

## Backend Architecture

### StreamingManager (`backend/src/ws/entry.ts`)

The `StreamingManager` class is responsible for tracking active streams and accumulating chunks.

**Key Properties**:
- `activeStreams: Map<string, StreamState>` - Tracks all active streams
- Stream key format: `${convId}_${messageId}`
- Each stream stores: `convId`, `messageId`, `chunks[]`, `fullResponse`, timestamps

**Lifecycle**:

#### 1. Stream Start (`startStream`)
```typescript
// Location: backend/src/ws/entry.ts:43-55
startStream(convId: string, messageId: string): void {
  const key = `${convId}_${messageId}`;
  this.activeStreams.set(key, {
    convId,
    messageId,
    chunks: [],
    fullResponse: '',
    startTime: Date.now(),
    lastChunkTime: Date.now(),
  });
}
```

**When called**: Before starting to stream LLM response chunks

#### 2. Chunk Accumulation (`addChunk`)
```typescript
// Location: backend/src/ws/entry.ts:57-65
addChunk(convId: string, messageId: string, chunk: string): void {
  const key = `${convId}_${messageId}`;
  const stream = this.activeStreams.get(key);
  if (stream) {
    stream.chunks.push(chunk);
    stream.fullResponse += chunk;
    stream.lastChunkTime = Date.now();
  }
}
```

**When called**: For each chunk received from the LLM

**Important**:
- Chunks are accumulated in `fullResponse`
- This is what enables resumption - the full accumulated text is available

#### 3. Stream Completion (`completeStream`)
```typescript
// Location: backend/src/ws/entry.ts:67-76
completeStream(convId: string, messageId: string): void {
  const key = `${convId}_${messageId}`;
  const stream = this.activeStreams.get(key);
  if (stream) {
    console.log(`[StreamingManager] Completing stream: ${key}`);
  }
  // CRITICAL: Remove the stream immediately after completion
  this.activeStreams.delete(key);
}
```

**When called**: After the LLM finishes streaming (after all chunks sent)

**CRITICAL BEHAVIOR**:
- Stream is deleted immediately upon completion
- No accumulated data persists after completion
- This means: **Resumption ONLY works for incomplete streams**

### Message Processing Flow

#### Normal Streaming (No Interruption)

```typescript
// Location: backend/src/ws/entry.ts:475-521
async handleUserMessage(userData: UserMessageData, originalMessage: WSMessage) {
  // 1. Start tracking the stream
  this.streamingManager.startStream(connectionInfo.convId, originalMessage.id);

  let fullResponse = "";
  let chunkCount = 0;

  // 2. Stream chunks from LLM
  for await (const chunk of conversation.sendMessage(userData.text)) {
    fullResponse += chunk;
    chunkCount++;

    // 3. Accumulate in StreamingManager
    this.streamingManager.addChunk(connectionInfo.convId, originalMessage.id, chunk);

    // 4. Broadcast to all connections in conversation
    this.broadcastToConv(connectionInfo.convId, {
      type: "llm_chunk",
      id: originalMessage.id,
      data: { chunk, isComplete: false, isAccumulated: false },
      metadata: {
        timestamp: Date.now(),
        convId: connectionInfo.convId,
        sequence: chunkCount,
        isAccumulated: false,
      },
    });
  }

  // 5. Send completion message
  this.broadcastToConv(connectionInfo.convId, {
    type: "llm_complete",
    id: originalMessage.id,
    data: { fullText: fullResponse, isComplete: true, isAccumulated: false },
    metadata: {
      timestamp: Date.now(),
      convId: connectionInfo.convId,
      isAccumulated: false,
    },
  });

  // 6. Clean up - stream is deleted here
  this.streamingManager.completeStream(connectionInfo.convId, originalMessage.id);
}
```

#### Reconnection and Resumption

```typescript
// Location: backend/src/ws/entry.ts:263-284
private sendAccumulatedChunks(ws: ServerWebSocket, convId: string): void {
  const activeStreams = this.streamingManager.getActiveStreamsForConv(convId);

  console.log(`[WebSocket] Sending ${activeStreams.length} accumulated streams for conversation: ${convId}`);

  // Send accumulated chunks for each active stream
  for (const stream of activeStreams) {
    if (stream.fullResponse.length > 0) {
      console.log(`[WebSocket] Sending accumulated chunk for message ${stream.messageId} (${stream.fullResponse.length} chars)`);

      this.sendToWebSocket(ws, {
        type: "llm_chunk",
        id: stream.messageId,  // Uses original message ID
        data: {
          chunk: stream.fullResponse,  // Full accumulated text
          isComplete: false,
          isAccumulated: true  // Flag indicating this is accumulated
        },
        metadata: {
          timestamp: stream.lastChunkTime,
          convId: stream.convId,
          isAccumulated: true,
        },
      });
    }
  }
}
```

**When called**: When a new WebSocket connection is established for an existing conversation

**Important**:
- Only sends ACTIVE (incomplete) streams
- Sends the FULL accumulated text as a single chunk
- Sets `isAccumulated: true` flag
- Uses the original `messageId` from when streaming started

## Frontend Architecture

### WSClient (`frontend/src/lib/ws/ws-client.ts`)

The `WSClient` handles WebSocket communication and emits events for the UI layer.

#### Message Parsing and Event Emission

```typescript
// Location: frontend/src/lib/ws/ws-client.ts:310-331
private async handleMessage(message: WSMessage): Promise<void> {
  switch (message.type) {
    case "llm_chunk":
      this.emit("llm_chunk", {
        chunk: message.data?.chunk || "",
        messageId: message.id,  // CRITICAL: Pass backend's message ID
        sequence: message.metadata?.sequence,
        isAccumulated: message.data?.isAccumulated || message.metadata?.isAccumulated || false,
      });
      break;

    case "llm_complete":
      this.emit("llm_complete", {
        fullText: message.data?.fullText || "",
        messageId: message.id,  // CRITICAL: Pass backend's message ID
        isAccumulated: message.data?.isAccumulated || message.metadata?.isAccumulated || false,
      });
      break;
  }
}
```

**Key Points**:
- `messageId` from backend MUST be passed to event handlers
- `isAccumulated` flag indicates if this is a resumption chunk
- Frontend cannot generate or modify message IDs

### Chat Interface (`frontend/src/components/shadcn-chat-interface.tsx`)

The chat interface manages message display and handles streaming updates.

#### Message State Management

```typescript
// Key refs for tracking current streaming message
const currentMessageRef = useRef<string>('');  // Accumulated content
const currentMessageIdRef = useRef<string | null>(null);  // Current message ID
```

**Important**:
- `currentMessageIdRef` stores the backend's message ID
- Used to update the correct message when completion arrives

#### Handling LLM Chunks

```typescript
// Location: frontend/src/components/shadcn-chat-interface.tsx:74-158
const handleLLMChunk = (data: {
  chunk: string;
  messageId?: string;
  sequence?: number;
  isAccumulated?: boolean
}) => {
  setMessages((prev) => {
    // Check if this is accumulated data from resumption
    if (data.isAccumulated) {
      console.log(`[Chunk-Accumulated] Received ${data.chunk.length} chars`);

      // For accumulated chunks, create or update the message with full content
      const messageId = data.messageId || `msg_${Date.now()}_assistant`;
      currentMessageIdRef.current = messageId;
      currentMessageRef.current = data.chunk;

      // Check if message already exists
      const existingMessageIndex = prev.findIndex(m => m.id === messageId);

      if (existingMessageIndex !== -1) {
        // Update existing message
        return prev.map(msg =>
          msg.id === messageId
            ? { ...msg, content: data.chunk }
            : msg
        );
      }

      // Create new message with accumulated content
      const newMessage: Message = {
        id: messageId,
        role: "assistant",
        content: data.chunk,
        createdAt: new Date(),
      };

      return [...prev, newMessage];
    }

    // Real-time streaming (not accumulated)
    if (!currentMessageIdRef.current || currentMessageIdRef.current === null) {
      // Start a new assistant message - use message ID from metadata
      const messageId = data.messageId || `msg_${Date.now()}_assistant`;
      currentMessageIdRef.current = messageId;
      currentMessageRef.current = data.chunk;

      const newMessage: Message = {
        id: messageId,  // CRITICAL: Use backend's ID
        role: "assistant",
        content: data.chunk,
        createdAt: new Date(),
      };

      return [...prev, newMessage];
    }

    // Append to existing message
    currentMessageRef.current += data.chunk;

    return prev.map((msg) =>
      msg.id === currentMessageIdRef.current
        ? { ...msg, content: currentMessageRef.current }
        : msg
    );
  });
};
```

**Flow**:
1. **Accumulated chunks** (`isAccumulated: true`): Create or update message with full content
2. **First real-time chunk**: Create new message using backend's `messageId`
3. **Subsequent chunks**: Append to existing message by ID

#### Handling Completion

```typescript
// Location: frontend/src/components/shadcn-chat-interface.tsx:212-264
const handleLLMComplete = (data: {
  fullText: string;
  messageId?: string;
  isAccumulated?: boolean
}) => {
  setMessages((prev) => {
    const fullText = data.fullText || currentMessageRef.current;

    // For accumulated completions, ONLY update existing messages
    if (data.isAccumulated) {
      const assistantMessages = prev.filter(m => m.role === "assistant");

      if (assistantMessages.length > 0) {
        const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
        return prev.map(msg =>
          msg.id === lastAssistantMessage.id
            ? { ...msg, content: fullText }
            : msg
        );
      }

      // If no assistant message exists, skip (don't create duplicate)
      return prev;
    }

    // For real-time completions, update the current message by ID
    if (currentMessageIdRef.current) {
      return prev.map(msg =>
        msg.id === currentMessageIdRef.current
          ? { ...msg, content: fullText }
          : msg
      );
    }

    // Fallback: update last assistant message
    const assistantMessages = prev.filter(m => m.role === "assistant");
    if (assistantMessages.length > 0) {
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      return prev.map(msg =>
        msg.id === lastAssistantMessage.id
          ? { ...msg, content: fullText }
          : msg
      );
    }

    return prev;
  });

  // Reset refs
  currentMessageRef.current = '';
  currentMessageIdRef.current = null;
};
```

**Key Behaviors**:
- **Accumulated completion**: Only updates existing messages, never creates new ones
- **Real-time completion**: Updates message by ID stored in `currentMessageIdRef`
- **Fallback**: Updates last assistant message if ID lookup fails
- **Cleanup**: Resets refs after completion

## Complete Flow Diagrams

### Normal Streaming (No Interruption)

```
User sends message
       ↓
Backend receives user_message
       ↓
StreamingManager.startStream(convId, messageId)
       ↓
Start LLM streaming
       ↓
For each chunk:
  ├─ StreamingManager.addChunk(convId, messageId, chunk)
  └─ Broadcast llm_chunk to all connections
       ↓
       Frontend receives llm_chunk
       ├─ Extract messageId from message.id
       ├─ If first chunk: Create message with backend's messageId
       └─ Else: Append to message with matching ID
       ↓
LLM finishes
       ↓
Backend sends llm_complete with fullText
       ↓
StreamingManager.completeStream(convId, messageId)
  [Stream deleted from activeStreams]
       ↓
Frontend receives llm_complete
       └─ Update message by messageId with fullText
       └─ Reset refs
```

### Resumption After Reconnection

```
User refreshes page during streaming
       ↓
Frontend WebSocket disconnects
       ↓
Backend keeps streaming to LLM
  └─ StreamingManager continues accumulating chunks
       ↓
Frontend reconnects with same convId (from localStorage)
       ↓
Backend receives new WebSocket connection
       ↓
Backend calls sendAccumulatedChunks(ws, convId)
       ├─ Gets all active streams for convId
       └─ For each stream:
           Send llm_chunk with:
             - id: original messageId
             - chunk: stream.fullResponse (all accumulated text)
             - isAccumulated: true
       ↓
Frontend receives accumulated llm_chunk
       ├─ Detects isAccumulated: true
       ├─ Uses messageId from backend
       ├─ Creates message with full accumulated content
       └─ Displays immediately (no gradual streaming)
       ↓
Backend continues streaming new chunks in real-time
       └─ Frontend appends as normal
       ↓
LLM finishes
       ↓
Backend sends llm_complete
       ↓
StreamingManager.completeStream(convId, messageId)
  [Stream deleted from activeStreams]
       ↓
Frontend receives llm_complete (isAccumulated: true)
       └─ Updates existing message with fullText
       └─ Reset refs
```

## Reliability Concerns and Edge Cases

### 1. Message ID Mismatch

**Problem**: Frontend generates its own message ID instead of using backend's ID

**Symptoms**:
- Message truncation (only shows partial content)
- Duplicate messages appearing
- Completion handler cannot find message to update

**Prevention**:
```typescript
// WRONG - Don't do this
const messageId = `msg_${Date.now()}_assistant`;

// CORRECT - Use backend's ID
const messageId = data.messageId || `msg_${Date.now()}_assistant`;
```

### 2. Completed Streams Not Available for Resumption

**Problem**: User expects to resume a completed message after reconnection

**Reality**:
- `completeStream()` immediately deletes the stream from `activeStreams`
- No persistence mechanism for completed messages
- Resumption only works for ACTIVE (incomplete) streams

**Implications**:
- If LLM finishes before reconnection: No resumption possible
- User will see empty assistant message or no message at all
- Need separate message history persistence (not just stream accumulation)

### 3. Multiple Connections to Same Conversation

**Problem**: Two browser tabs open with same `convId`

**Current Behavior**:
- Both connections receive all chunks (via `broadcastToConv`)
- Both connections receive accumulated chunks on reconnect
- Both should stay in sync

**Potential Issue**:
- Race conditions if both tabs send messages simultaneously
- No coordination between tabs

### 4. Stream Cleanup Timing

**Problem**: What if completion message is lost but stream is already deleted?

**Current Behavior**:
- Backend deletes stream immediately after sending `llm_complete`
- If `llm_complete` is lost in transit, frontend won't receive full text
- Stream is gone, so reconnection won't help

**Potential Solution**:
- Delay stream deletion by a few seconds
- Or: Keep completed streams for a grace period
- Or: Store in conversation history separately

### 5. Accumulated Chunk Delivery Guarantees

**Problem**: What if accumulated chunks are sent but connection drops immediately?

**Current Behavior**:
- `sendAccumulatedChunks` is called once per connection
- If connection drops during transmission, chunks may not arrive
- Next reconnection will resend accumulated chunks

**Reliability**:
- Frontend should handle receiving accumulated chunks multiple times
- Current implementation updates by ID, so this should be safe

## Testing Scenarios

### Scenario 1: Normal Streaming
1. Send message
2. Observe chunks arriving gradually
3. Verify completion updates message with full text
4. Verify stream is deleted from backend

### Scenario 2: Refresh During Streaming
1. Send message
2. Wait for a few chunks to arrive
3. Refresh page
4. Verify accumulated content appears immediately
5. Verify new chunks continue to append
6. Verify completion updates correctly

### Scenario 3: Disconnect and Reconnect
1. Send message
2. Manually close WebSocket connection (via DevTools)
3. Let backend continue streaming for a few seconds
4. Reconnect
5. Verify accumulated chunks are delivered
6. Verify streaming continues

### Scenario 4: Message ID Synchronization
1. Add logging to track message IDs
2. Send message
3. Verify backend and frontend use same message ID
4. Verify completion handler finds message by ID

### Scenario 5: Multiple Connections
1. Open two tabs with same conversation
2. Send message from one tab
3. Verify both tabs receive chunks
4. Verify both tabs show same content

## Known Limitations

1. **No persistence after completion**: Streams are deleted immediately after completion
2. **No message history**: Only conversation history (in ConversationManager), not individual messages
3. **No guaranteed delivery**: If `llm_complete` is lost, frontend has incomplete message
4. **No coordination**: Multiple tabs can send conflicting messages
5. **Memory-only storage**: All stream state lives in memory (lost on server restart)

## Future Improvements

1. **Persistent Message Storage**
   - Store completed messages in database
   - Allow full history retrieval
   - Enable resumption even for completed messages

2. **Grace Period for Completed Streams**
   - Keep completed streams for 30 seconds before deletion
   - Handle late reconnections better

3. **Delivery Acknowledgment**
   - Frontend acknowledges receipt of `llm_complete`
   - Backend only deletes stream after acknowledgment

4. **Tab Coordination**
   - Use localStorage events to coordinate between tabs
   - Prevent duplicate message sends

5. **Server-Side Persistence**
   - Store streams in Redis or similar
   - Survive server restarts

6. **Retry Logic**
   - Automatic retry for lost completion messages
   - Exponential backoff for failed reconnections

## Debugging Guide

### Backend Logging

Key log statements in `backend/src/ws/entry.ts`:

```typescript
console.log(`[StreamingManager] Starting stream: ${key}`);
console.log(`[StreamingManager] Adding chunk to ${key}: "${chunk}" (${chunk.length} chars)`);
console.log(`[StreamingManager] Completing stream: ${key} (had ${stream.fullResponse.length} chars)`);
console.log(`[WebSocket] Sending ${activeStreams.length} accumulated streams for conversation: ${convId}`);
```

### Frontend Logging

Key log statements in `frontend/src/components/shadcn-chat-interface.tsx`:

```typescript
console.log(`[Chunk-Accumulated] Received ${data.chunk.length} chars`);
console.log(`[Chunk] Creating new message with ID: ${messageId}`);
console.log(`[Chunk] Appending "${data.chunk}" to message ${currentMessageIdRef.current}`);
console.log(`[Complete] Finalizing message ${currentMessageIdRef.current}`);
console.log(`[Complete] Updating message by ID: ${messageId}`);
```

### Common Issues

**Issue**: Message shows partial content
- **Check**: Do backend and frontend message IDs match?
- **Fix**: Ensure frontend uses `data.messageId` from backend

**Issue**: Two assistant messages appear
- **Check**: Is `handleLLMComplete` creating new messages for accumulated data?
- **Fix**: Ensure accumulated completions only update, never create

**Issue**: No content after refresh
- **Check**: Is stream still active in backend?
- **Check**: Is `sendAccumulatedChunks` being called?
- **Check**: Is `isAccumulated` flag set correctly?

**Issue**: Content disappears after completion
- **Check**: Is completion handler finding the right message by ID?
- **Check**: Is `currentMessageIdRef.current` set correctly?

## Conclusion

The streaming and resumption system relies on tight coordination between backend and frontend:

1. **Backend generates and owns message IDs** - frontend must use them exactly
2. **Streams are conversation-scoped** - not connection-scoped
3. **Accumulation enables resumption** - but only for active (incomplete) streams
4. **Immediate cleanup after completion** - no persistence beyond active streaming
5. **isAccumulated flag** - distinguishes resumption from real-time streaming

Understanding these principles is essential for maintaining reliability and debugging issues.
