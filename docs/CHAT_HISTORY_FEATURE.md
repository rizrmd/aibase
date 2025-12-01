# Chat History Persistence Feature

## Overview
This feature automatically saves conversation history to disk, ensuring that chat messages persist across server restarts and can be recovered at any time.

## File Structure
Chat history is saved in the following location:
```
/data/{project-id}/{conversation-id}/chats/{conversation-start-timestamp}.json
```

### Example
```
backend/data/A1/conv_1764508180370_gcaw6d8an/chats/1764508180370.json
```

## File Format

### Chat History JSON Structure
```json
{
  "metadata": {
    "convId": "conv_1764508180370_gcaw6d8an",
    "projectId": "A1",
    "createdAt": 1764508180370,
    "lastUpdatedAt": 1764508500000,
    "messageCount": 15
  },
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant..."
    },
    {
      "role": "user",
      "content": "Hello, how are you?",
      "id": "msg_123"
    },
    {
      "role": "assistant",
      "content": "I'm doing well, thank you!",
      "id": "msg_124",
      "completionTime": 2.5
    }
  ]
}
```

## Implementation Details

### Key Components

1. **ChatHistoryStorage** (`backend/src/storage/chat-history-storage.ts`)
   - Singleton service for managing chat history files
   - Methods:
     - `loadChatHistory(convId)`: Load conversation history from disk
     - `saveChatHistory(convId, messages)`: Save conversation history to disk
     - `listChatHistoryFiles(convId)`: List all history files for a conversation
     - `deleteChatHistory(convId)`: Delete all history files
     - `getChatHistoryMetadata(convId)`: Get metadata without loading all messages

2. **MessagePersistence** (`backend/src/ws/msg-persistance.ts`)
   - Updated to integrate with ChatHistoryStorage
   - Automatically saves to disk on every message update
   - Methods:
     - `getClientHistory(convId)`: Now async, loads from disk if not in memory
     - `getClientHistorySync(convId)`: Synchronous version for backward compatibility
     - `setClientHistory(convId, messages)`: Saves to both memory and disk
     - `addClientMessage(convId, message)`: Saves to both memory and disk

3. **WebSocket Server** (`backend/src/ws/entry.ts`)
   - Updated to load chat history from disk on connection
   - Persists messages on every update via hooked `addMessage` method

### Persistence Flow

1. **On New Connection**
   ```
   Client connects → Load history from disk → Create conversation with history
   ```

2. **On Message Send**
   ```
   User sends message → Add to conversation → Save to memory → Save to disk
   ```

3. **On Assistant Response**
   ```
   LLM responds → Add to conversation → Save to memory → Save to disk
   ```

### Timestamp Management

- Each conversation gets a unique start timestamp when first created
- This timestamp is used for the filename: `{timestamp}.json`
- The timestamp is tracked in memory to ensure consistency across saves
- On load, the most recent history file (highest timestamp) is used

## Benefits

1. **Persistence**: Conversation history survives server restarts
2. **Recovery**: Easy to recover conversations from disk
3. **Backup**: Automatic backup of all conversations
4. **Debugging**: Easy to inspect conversation history in JSON format
5. **Scalability**: Each conversation stored in its own file

## Migration

For existing conversations:
- No migration needed
- On first message after deployment, a new chat history file will be created
- Previous in-memory messages will be included in the first save

## Performance

- **Save**: Asynchronous, non-blocking (fire-and-forget)
- **Load**: Synchronous on connection, cached in memory
- **Memory**: Only active conversations kept in memory
- **Disk**: JSON format with pretty-printing for readability

## Future Enhancements

1. **Compression**: Compress old conversation files
2. **Archiving**: Move old conversations to archive storage
3. **Search**: Index conversations for full-text search
4. **Export**: Export conversations in different formats (Markdown, PDF)
5. **Cleanup**: Automatic cleanup of old conversations
6. **Versioning**: Keep multiple versions of conversation history

## API Reference

### ChatHistoryStorage

```typescript
class ChatHistoryStorage {
  // Load chat history from disk
  async loadChatHistory(
    convId: string,
    projectId?: string
  ): Promise<ChatCompletionMessageParam[]>

  // Save chat history to disk
  async saveChatHistory(
    convId: string,
    messages: ChatCompletionMessageParam[],
    projectId?: string
  ): Promise<void>

  // List all chat history files
  async listChatHistoryFiles(
    convId: string,
    projectId?: string
  ): Promise<string[]>

  // Delete chat history
  async deleteChatHistory(
    convId: string,
    projectId?: string
  ): Promise<void>

  // Get metadata only
  async getChatHistoryMetadata(
    convId: string,
    projectId?: string
  ): Promise<ChatHistoryMetadata | null>
}
```

### MessagePersistence

```typescript
class MessagePersistence {
  // Load history (async - checks disk)
  async getClientHistory(
    convId: string
  ): Promise<ChatCompletionMessageParam[]>

  // Load history (sync - memory only)
  getClientHistorySync(
    convId: string
  ): ChatCompletionMessageParam[]

  // Save history (saves to both memory and disk)
  setClientHistory(
    convId: string,
    messages: ChatCompletionMessageParam[]
  ): void

  // Add message (saves to both memory and disk)
  addClientMessage(
    convId: string,
    message: ChatCompletionMessageParam
  ): void
}
```

## Testing

To verify the feature is working:

1. Start a new conversation
2. Send some messages
3. Check that the file was created:
   ```bash
   ls backend/data/A1/{conv-id}/chats/
   ```
4. Inspect the file:
   ```bash
   cat backend/data/A1/{conv-id}/chats/{timestamp}.json
   ```
5. Restart the server
6. Reconnect with the same conversation ID
7. Verify messages are loaded from disk

## Troubleshooting

### Chat history not loading
- Check file permissions on `/data` directory
- Verify JSON file is valid
- Check server logs for error messages

### Chat history not saving
- Check disk space
- Verify write permissions
- Check for console errors: `[ChatHistoryStorage] Error saving`

### Multiple history files
- Only the most recent file (highest timestamp) is loaded
- Old files can be safely deleted

## Notes

- Chat history files are pretty-printed JSON (2-space indentation)
- System messages are included in the saved history
- Message IDs and completion times are preserved
- Files are saved asynchronously to avoid blocking
