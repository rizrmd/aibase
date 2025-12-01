# Chat Compaction System - Usage Examples

## Example 1: Automatic Compaction

### Scenario
A long-running conversation reaches 155,000 tokens. The system automatically compacts it after the next message.

### Flow

1. **User sends message:**
   ```json
   {
     "type": "user_message",
     "id": "msg_user_1",
     "data": {
       "text": "Can you summarize our discussion?"
     }
   }
   ```

2. **System processes message and saves history**
   - Current token count: 155,000 tokens (exceeds 150K threshold)
   - Auto-compaction triggers

3. **Compaction process:**
   - Original: 80 messages (155K tokens)
   - Keeps: Last 20 messages in full
   - Compacts: First 60 messages into summary
   - New file created: `/data/A1/conv_xxx/chats/1733500000000.json`

4. **Clients receive notification:**
   ```json
   {
     "type": "notification",
     "id": "compaction_1733500000000",
     "data": {
       "message": "Chat history compacted. Saved approximately 45000 tokens.",
       "severity": "info"
     },
     "metadata": { "timestamp": 1733500000000 }
   }
   ```

5. **Result:**
   - New chat file has 21 messages (1 summary + 20 recent)
   - Estimated ~110K tokens (down from 155K)
   - Context preserved, conversation continues normally

---

## Example 2: Manual Compaction

### Scenario
Developer wants to test compaction or compact before reaching threshold.

### Client Code (JavaScript)

```javascript
// Create WebSocket connection
const ws = new WebSocket('ws://localhost:3000');

// Function to send control message
function compactChat() {
  const message = {
    type: 'control',
    id: `compact_${Date.now()}`,
    data: {
      type: 'compact_chat'
    }
  };

  ws.send(JSON.stringify(message));
}

// Listen for response
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'control_response' &&
      message.data.type === 'compact_chat') {
    console.log('Compaction result:', message.data);
    // Output:
    // {
    //   status: "compacted",
    //   type: "compact_chat",
    //   compacted: true,
    //   newChatFile: "/path/to/new/file.json",
    //   tokensSaved: 45000
    // }
  }
});

// Trigger compaction
compactChat();
```

---

## Example 3: Check Compaction Status

### Client Code

```javascript
function checkCompactionStatus() {
  const message = {
    type: 'control',
    id: `status_${Date.now()}`,
    data: {
      type: 'get_compaction_status'
    }
  };

  ws.send(JSON.stringify(message));
}

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'control_response' &&
      message.data.type === 'get_compaction_status') {
    const status = message.data;

    console.log(`Token Usage: ${status.currentTokens} / ${status.threshold}`);
    console.log(`Utilization: ${status.utilizationPercent}%`);
    console.log(`Should Compact: ${status.shouldCompact}`);

    // Example output:
    // Token Usage: 75000 / 150000
    // Utilization: 50%
    // Should Compact: false
  }
});

checkCompactionStatus();
```

---

## Example 4: Backend API Usage

### Direct API Call

```typescript
import { MessagePersistence } from './ws/msg-persistance';

const messagePersistence = MessagePersistence.getInstance();

// Check and compact if needed
async function manageConversation(projectId: string, convId: string) {
  // Get current status
  const status = await messagePersistence.getCompactionStatus(
    projectId,
    convId
  );

  console.log('Current status:', status);

  // Force compaction if utilization > 80%
  if (status.utilizationPercent > 80) {
    const result = await messagePersistence.checkAndCompact(
      projectId,
      convId
    );

    if (result.compacted) {
      console.log(`Compacted! Saved ${result.tokensSaved} tokens`);
      console.log(`New file: ${result.newChatFile}`);
    }
  }
}

// Example usage
manageConversation('A1', 'conv_1733500000000_abc123');
```

---

## Example 5: Custom Configuration

### Adjust Compaction Settings

Edit `/backend/src/storage/chat-compaction.ts`:

```typescript
const DEFAULT_CONFIG: CompactionConfig = {
  tokenThreshold: 180000,      // Increase threshold to 180K
  keepRecentMessages: 30,      // Keep 30 recent messages
  compactionModel: 'gpt-4o'    // Use GPT-4o for better summaries
};
```

### Per-Instance Configuration

```typescript
import { ChatCompaction } from './storage/chat-compaction';

// Create custom compaction instance
const customCompaction = new ChatCompaction({
  tokenThreshold: 100000,      // More aggressive compaction
  keepRecentMessages: 15,      // Less context
  compactionModel: 'gpt-4o-mini' // Cheaper model
});

// Use it
const shouldCompact = await customCompaction.shouldCompact(
  'A1',
  'conv_xxx'
);
```

---

## Example 6: Monitoring Compaction

### Log Analysis

```bash
# Watch for compaction events
tail -f backend.log | grep -i compaction

# Example output:
# [Compaction] Manual compaction requested for convId: conv_xxx
# [MessagePersistence] Compacted 60 messages for conv_xxx
# [MessagePersistence] Saved approximately 45000 tokens
# [MessagePersistence] New chat file: /data/A1/conv_xxx/chats/1733500000000.json
# [Auto-Compaction] Compacted chat for conv_xxx, saved ~45000 tokens
```

### Database Query (if using DB)

```sql
-- Check compaction history
SELECT
  convId,
  messageCount,
  totalTokens,
  lastUpdatedAt
FROM conversations
WHERE totalTokens > 150000
ORDER BY totalTokens DESC;
```

---

## Example 7: React Frontend Integration

### Create a Compaction Status Component

```typescript
import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';

interface CompactionStatus {
  shouldCompact: boolean;
  currentTokens: number;
  threshold: number;
  utilizationPercent: number;
}

export function CompactionStatus() {
  const { sendMessage, onMessage } = useWebSocket();
  const [status, setStatus] = useState<CompactionStatus | null>(null);

  // Request status on mount
  useEffect(() => {
    const requestStatus = () => {
      sendMessage({
        type: 'control',
        id: `status_${Date.now()}`,
        data: { type: 'get_compaction_status' }
      });
    };

    requestStatus();
    const interval = setInterval(requestStatus, 60000); // Every minute

    return () => clearInterval(interval);
  }, [sendMessage]);

  // Listen for status updates
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === 'control_response' &&
          message.data.type === 'get_compaction_status') {
        setStatus({
          shouldCompact: message.data.shouldCompact,
          currentTokens: message.data.currentTokens,
          threshold: message.data.threshold,
          utilizationPercent: message.data.utilizationPercent
        });
      }
    };

    onMessage(handler);
  }, [onMessage]);

  if (!status) return <div>Loading...</div>;

  const getColor = () => {
    if (status.utilizationPercent > 90) return 'red';
    if (status.utilizationPercent > 70) return 'orange';
    return 'green';
  };

  return (
    <div className="compaction-status">
      <h3>Token Usage</h3>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${status.utilizationPercent}%`,
            backgroundColor: getColor()
          }}
        />
      </div>
      <p>
        {status.currentTokens.toLocaleString()} / {status.threshold.toLocaleString()}
        ({status.utilizationPercent.toFixed(1)}%)
      </p>
      {status.shouldCompact && (
        <button onClick={() => {
          sendMessage({
            type: 'control',
            id: `compact_${Date.now()}`,
            data: { type: 'compact_chat' }
          });
        }}>
          Compact Now
        </button>
      )}
    </div>
  );
}
```

---

## Example 8: Testing Compaction

### Unit Test

```typescript
import { describe, expect, it, beforeAll } from 'bun:test';
import { chatCompaction } from './storage/chat-compaction';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

describe('Chat Compaction', () => {
  const projectId = 'TEST';
  const convId = 'test_conv_123';

  it('should detect when compaction is needed', async () => {
    const shouldCompact = await chatCompaction.shouldCompact(
      projectId,
      convId
    );

    expect(typeof shouldCompact).toBe('boolean');
  });

  it('should compact messages correctly', async () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'System prompt' },
      ...Array(50).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`
      }))
    ];

    const result = await chatCompaction.compactChat(
      projectId,
      convId,
      messages
    );

    if (result.compacted) {
      expect(result.newChatFile).toBeDefined();
      expect(result.tokensSaved).toBeGreaterThan(0);
      expect(result.messagesCompacted).toBe(30); // 50 - 20 recent
    }
  });
});
```

---

## Troubleshooting Examples

### Example: Compaction Fails

```typescript
// Add error handling
try {
  const result = await messagePersistence.checkAndCompact(
    projectId,
    convId
  );

  if (!result.compacted) {
    console.log('Compaction not needed or failed');
    console.log('Checking status...');

    const status = await messagePersistence.getCompactionStatus(
      projectId,
      convId
    );

    console.log('Status:', status);
  }
} catch (error) {
  console.error('Compaction error:', error);
  // Fallback: continue without compaction
}
```

### Example: Verify Compacted File

```typescript
import { promises as fs } from 'fs';
import path from 'path';

async function verifyCompaction(convId: string, timestamp: number) {
  const chatPath = path.join(
    process.cwd(),
    'data',
    'A1',
    convId,
    'chats',
    `${timestamp}.json`
  );

  const content = await fs.readFile(chatPath, 'utf-8');
  const chat = JSON.parse(content);

  console.log('Metadata:', chat.metadata);
  console.log('Total messages:', chat.messages.length);
  console.log('Is compacted:', chat.metadata.compacted);

  // Find compacted summary
  const summary = chat.messages.find(
    m => m.role === 'system' &&
         m.content?.includes('COMPACTED HISTORY')
  );

  if (summary) {
    console.log('Found compacted summary:', summary.content);
  }
}
```
