# Compaction UI - User Guide

## Overview

The Compaction Status UI displays real-time token usage and allows manual compaction of chat history to prevent context window limits from being exceeded.

## Location

The compaction status bar appears in the chat interface:
- **Position**: Below any error/upload alerts, above the chat messages
- **Visibility**: Only shown when there are messages in the conversation

## UI Components

### Status Bar

The compaction status bar displays:

1. **Token Usage Label** - Shows "Token Usage" text
2. **Progress Bar** - Visual representation of token utilization
   - **Green** (0-49%): Safe
   - **Yellow** (50-69%): Moderate
   - **Orange** (70-89%): High
   - **Red** (90-100%): Critical
3. **Percentage** - Current utilization percentage
4. **Token Count** - "X / Y tokens" showing current vs. threshold
5. **Compact Button** - Appears when utilization ≥ threshold (default: 150K)

### Visual States

#### Safe (< 50%)
```
┌─────────────────────────────────────────────┐
│ Token Usage                           25.5% │
│ [████████░░░░░░░░░░░░░░░░░░░░░░░░░░░]      │
│ 38,250 / 150,000                            │
└─────────────────────────────────────────────┘
```

#### Moderate (50-69%)
```
┌─────────────────────────────────────────────┐
│ Token Usage                           58.3% │
│ [███████████████████░░░░░░░░░░░░░░░]       │
│ 87,450 / 150,000                            │
└─────────────────────────────────────────────┘
```

#### Critical (≥ 90%)
```
┌───────────────────────────────────────────────────┐
│ Token Usage                           93.2%       │
│ [█████████████████████████████████] [⚡ Compact] │
│ 139,800 / 150,000                                 │
└───────────────────────────────────────────────────┘
```

## Features

### Automatic Updates

- **Real-time monitoring**: Checks token usage every 60 seconds
- **Auto-refresh**: Updates after each message is sent
- **Compaction notifications**: Shows when auto-compaction completes

### Manual Compaction

**When to use:**
- Token usage is approaching the threshold
- You want to reduce context before a long conversation
- Testing the compaction feature

**How to trigger:**
1. Wait for the "Compact" button to appear (≥90% utilization)
2. Click the button
3. Wait for "Compacting..." indicator
4. Status bar will refresh showing reduced token count

**What happens:**
- Older messages are summarized using AI
- Last 20 messages kept in full
- New chat file created with timestamp
- Approximately 30-50% token reduction (varies)

### Notifications

When auto-compaction occurs, you'll see a toast notification:
```
ℹ Chat history compacted. Saved approximately 45000 tokens.
```

## Technical Details

### Data Flow

```
Frontend (CompactionStatus)
    ↓
WebSocket Control Message: get_compaction_status
    ↓
Backend checks info.json
    ↓
Returns: currentTokens, threshold, utilizationPercent
    ↓
Frontend updates UI
```

### Manual Compaction Flow

```
User clicks "Compact" button
    ↓
WebSocket Control Message: compact_chat
    ↓
Backend compacts older messages
    ↓
Creates new chat file: /data/{proj}/{conv}/chats/{timestamp}.json
    ↓
Returns: compacted=true, tokensSaved, newChatFile
    ↓
Frontend shows success, refreshes status
```

## Configuration

### Token Threshold

Default: **150,000 tokens**

To change (backend):
```typescript
// backend/src/storage/chat-compaction.ts
const DEFAULT_CONFIG: CompactionConfig = {
  tokenThreshold: 200000, // Change to 200K
  keepRecentMessages: 20,
  compactionModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
};
```

### Recent Messages

Default: **20 messages** kept in full

To change (backend):
```typescript
const DEFAULT_CONFIG: CompactionConfig = {
  tokenThreshold: 150000,
  keepRecentMessages: 30, // Keep 30 instead of 20
  compactionModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
};
```

### Update Interval

Default: **60 seconds**

To change (frontend):
```typescript
// frontend/src/components/compaction-status.tsx
const interval = setInterval(requestStatus, 30000); // Every 30s instead
```

## Styling

The component uses Tailwind CSS classes and adapts to your theme:

- **Light mode**: Standard colors
- **Dark mode**: Automatically adjusted colors
- **Progress bar**: Smooth transitions
- **Button**: Outline variant with icon

### Customization

Edit `frontend/src/components/compaction-status.tsx`:

```typescript
// Change colors
const getColor = () => {
  if (status.utilizationPercent >= 95) return "bg-red-600";  // More aggressive
  if (status.utilizationPercent >= 80) return "bg-orange-500";
  if (status.utilizationPercent >= 60) return "bg-yellow-400";
  return "bg-green-500";
};

// Change compact button threshold
{status.utilizationPercent >= 80 && ( // Show at 80% instead of shouldCompact
  <Button ... />
)}
```

## Troubleshooting

### Status Not Showing

**Symptoms**: Compaction bar doesn't appear

**Causes**:
1. No messages in conversation yet
2. WebSocket not connected
3. Backend not responding

**Solutions**:
1. Send at least one message
2. Check connection status
3. Check browser console for errors
4. Verify backend is running

### Button Not Appearing

**Symptoms**: No "Compact" button even with high token usage

**Causes**:
1. Token usage below threshold
2. Backend reporting incorrect status

**Solutions**:
1. Check actual token count in status bar
2. Manually trigger via browser console:
   ```javascript
   // Get WebSocket client from React DevTools
   wsClient.sendControl({ type: 'compact_chat' });
   ```

### Compaction Fails

**Symptoms**: Clicking "Compact" shows error or nothing happens

**Causes**:
1. Not enough messages to compact (< 20)
2. LLM API error
3. File system permissions

**Solutions**:
1. Need more conversation history
2. Check backend logs for API errors
3. Verify write permissions to /data directory

## Best Practices

### When to Compact

✅ **Good times:**
- Token usage > 90%
- Before starting a complex task
- After a long conversation segment
- When context window errors occur

❌ **Avoid:**
- Too frequently (< 50% usage)
- During active generation
- When immediate context is critical

### Monitoring

- Check status periodically during long sessions
- Watch for yellow/orange indicators
- Plan compaction during natural conversation breaks

### Performance

- **Compaction time**: 3-10 seconds (depends on message count)
- **Token savings**: 30-50% typically
- **Context loss**: Minimal (summary preserves key info)

## Accessibility

- **Keyboard**: Button focusable via Tab
- **Screen readers**: Status announced
- **Color blind**: Uses both color and text indicators
- **Reduced motion**: Respects prefers-reduced-motion

## Related Documentation

- [Backend Compaction System](../../backend/docs/COMPACTION_SYSTEM.md)
- [Compaction Examples](../../backend/docs/COMPACTION_EXAMPLE.md)
- [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md)
