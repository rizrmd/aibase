# Chat Compaction System

## Overview

The chat compaction system automatically manages conversation history to prevent token limits from being exceeded. When a conversation's token usage reaches a configurable threshold, older messages are summarized using an LLM, creating a compact representation while preserving important context.

## How It Works

### 1. Token Monitoring

The system monitors token usage through the `info.json` file located at:
```
/data/{projectId}/{convId}/info.json
```

This file tracks:
- Total tokens used across all messages
- Token usage history per message
- Total message count
- Last updated timestamp

### 2. Compaction Trigger

Compaction can be triggered in two ways:

#### A. Automatic Compaction
- After each message is sent and saved
- Checks if total tokens >= threshold (default: 150,000 tokens)
- Runs asynchronously without blocking the conversation
- Notifies clients when compaction completes

#### B. Manual Compaction
- Via WebSocket control message: `{ type: "compact_chat" }`
- Useful for testing or forcing compaction before threshold
- Returns compaction result to client

### 3. Compaction Process

When compaction is triggered:

1. **Message Separation**
   - System message is extracted
   - Recent messages are preserved (default: 20 messages)
   - Older messages are selected for compaction

2. **LLM Summarization**
   - Older messages are sent to an LLM (default: gpt-4o-mini)
   - LLM creates a comprehensive summary preserving:
     - Key facts and decisions
     - Important code and technical details
     - File/database references
     - Chronological flow
     - Memory items and configurations

3. **New Chat File Creation**
   - New file created: `/data/{projectId}/{convId}/chats/{timestamp}.json`
   - Structure:
     ```json
     {
       "metadata": {
         "convId": "conv_xxx",
         "projectId": "A1",
         "createdAt": 1234567890,
         "lastUpdatedAt": 1234567890,
         "messageCount": 25,
         "compacted": true
       },
       "messages": [
         { "role": "system", "content": "..." },
         { "role": "system", "content": "=== COMPACTED HISTORY ===..." },
         ...recent messages...
       ]
     }
     ```

4. **History Replacement**
   - Compacted message prepended as system message
   - Recent messages appended in full
   - Old chat file remains on disk (not deleted)

## Configuration

### Default Settings

```typescript
{
  tokenThreshold: 150000,      // Trigger at 150K tokens
  keepRecentMessages: 20,      // Keep last 20 messages in full
  compactionModel: 'gpt-4o-mini' // Model for summarization
}
```

### Customizing Configuration

Modify in `/backend/src/storage/chat-compaction.ts`:

```typescript
const DEFAULT_CONFIG: CompactionConfig = {
  tokenThreshold: 200000,      // Higher threshold
  keepRecentMessages: 30,      // Keep more recent messages
  compactionModel: 'gpt-4o'    // Use more powerful model
};
```

## API Reference

### WebSocket Control Messages

#### Get Compaction Status

**Request:**
```json
{
  "type": "control",
  "id": "msg_123",
  "data": {
    "type": "get_compaction_status"
  }
}
```

**Response:**
```json
{
  "type": "control_response",
  "id": "msg_123",
  "data": {
    "status": "compaction_status",
    "type": "get_compaction_status",
    "shouldCompact": false,
    "currentTokens": 75000,
    "threshold": 150000,
    "utilizationPercent": 50.0
  },
  "metadata": { "timestamp": 1234567890 }
}
```

#### Trigger Manual Compaction

**Request:**
```json
{
  "type": "control",
  "id": "msg_124",
  "data": {
    "type": "compact_chat"
  }
}
```

**Response:**
```json
{
  "type": "control_response",
  "id": "msg_124",
  "data": {
    "status": "compacted",
    "type": "compact_chat",
    "compacted": true,
    "newChatFile": "/path/to/new/chat/file.json",
    "tokensSaved": 45000
  },
  "metadata": { "timestamp": 1234567890 }
}
```

### Backend API

#### Check and Compact

```typescript
const result = await messagePersistence.checkAndCompact(projectId, convId);
```

**Returns:**
```typescript
{
  compacted: boolean;
  newChatFile?: string;
  tokensSaved?: number;
}
```

#### Get Compaction Status

```typescript
const status = await messagePersistence.getCompactionStatus(projectId, convId);
```

**Returns:**
```typescript
{
  shouldCompact: boolean;
  currentTokens: number;
  threshold: number;
  utilizationPercent: number;
}
```

## File Structure

### Before Compaction

```
/data/A1/conv_xxx/
├── chats/
│   └── 1234567890.json  (original, 100 messages)
└── info.json            (175,000 tokens)
```

### After Compaction

```
/data/A1/conv_xxx/
├── chats/
│   ├── 1234567890.json  (original, kept for history)
│   └── 1234567891.json  (new, compacted + 20 recent)
└── info.json            (same, unchanged)
```

**Note:** The info.json token counts are NOT reset after compaction. They continue to accumulate. Compaction reduces the context sent to the LLM, not the historical token tracking.

## Token Estimation

The system estimates tokens saved using a rough approximation:
- 1 token ≈ 4 characters
- Compares original message length vs. summary length
- Actual savings may vary based on message complexity

## Error Handling

### Automatic Compaction Errors
- Logged to console but don't interrupt conversation flow
- Message history still saved even if compaction fails
- Client continues to function normally

### Manual Compaction Errors
- Error response sent to client
- Error codes: `COMPACTION_ERROR`, `COMPACTION_STATUS_ERROR`
- Original chat file unchanged

## Best Practices

1. **Monitor Token Usage**
   - Regularly check compaction status for long conversations
   - Adjust threshold based on your LLM's context window

2. **Keep Recent Messages**
   - Balance between context and token savings
   - Higher keepRecentMessages = better immediate context
   - Lower keepRecentMessages = more token savings

3. **Model Selection**
   - Use cheaper models (gpt-4o-mini) for cost efficiency
   - Use powerful models (gpt-4o) for better summaries
   - Consider latency vs. quality tradeoff

4. **Testing**
   - Test compaction with various conversation types
   - Verify important context is preserved
   - Check summary quality with different models

## Notifications

When auto-compaction occurs, all connected clients receive:

```json
{
  "type": "notification",
  "id": "compaction_1234567890",
  "data": {
    "message": "Chat history compacted. Saved approximately 45000 tokens.",
    "severity": "info"
  },
  "metadata": { "timestamp": 1234567890 }
}
```

## Troubleshooting

### Compaction Not Triggering

1. Check token usage in info.json
2. Verify threshold configuration
3. Check console logs for errors
4. Ensure LLM provider is accessible

### Summary Quality Issues

1. Increase `keepRecentMessages` to preserve more context
2. Use a more powerful model (gpt-4o vs gpt-4o-mini)
3. Customize the summary prompt in chat-compaction.ts

### File System Issues

1. Verify write permissions to /data directory
2. Check disk space availability
3. Ensure chat directory exists

## Future Enhancements

Potential improvements:
- [ ] Support for multiple compaction strategies (sliding window, hierarchical)
- [ ] Configurable summary prompts per project
- [ ] Compression statistics and analytics
- [ ] Automatic old file cleanup
- [ ] Token reset option after compaction
- [ ] Custom compaction rules per conversation type
