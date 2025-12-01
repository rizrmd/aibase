# Architecture Documentation Index

This project has complete documentation for the chat and conversation architecture. Start here to find what you need.

## Your Question → Right Document

### "How does the chat system work?"
→ Read **ARCHITECTURE_GUIDE.md** then **CHAT_ARCHITECTURE.md** sections 1-7

### "Where is my conversation history?"
→ **QUICK_REFERENCE.md** → Search: "Where is the conversation history stored?"

### "How do messages flow from frontend to backend?"
→ **DATA_FLOW.md** → Section 1: "User Message to LLM Response Flow"

### "I need to find where X is in the code"
→ **QUICK_REFERENCE.md** → "Key Paths to Know" or "How to Find Things"

### "What happens when a new client connects?"
→ **DATA_FLOW.md** → Section 2: "New Client Connection and History Load Flow"

### "How do files get uploaded?"
→ **DATA_FLOW.md** → Section 3: "File Upload Flow"

### "How does tool execution work?"
→ **DATA_FLOW.md** → Section 4: "Tool Execution and Broadcasting Flow"

### "I want to modify the chat architecture"
→ **QUICK_REFERENCE.md** → "Common Tasks" for your specific need

### "What are the current limitations?"
→ **CHAT_ARCHITECTURE.md** → Section 11: "Current Limitations and Notes"

### "I need the full detailed reference"
→ **CHAT_ARCHITECTURE.md** (520 lines, comprehensive)

## Documentation Summary

| Document | Purpose | Length | Best For |
|----------|---------|--------|----------|
| ARCHITECTURE_GUIDE.md | Navigation hub | 4.5KB | Starting point, overview |
| CHAT_ARCHITECTURE.md | Complete reference | 17KB | Deep understanding |
| QUICK_REFERENCE.md | Fast lookup | 7.1KB | Finding things quickly |
| DATA_FLOW.md | Visual flows | 35KB | Understanding sequences |

## Key Facts (Memorize These)

```
FRONTEND STORAGE
  → localStorage['ws_conv_id']        (conversation ID)
  → localStorage['chat_messages']     (message history)
  → Zustand store (useChatStore)     (real-time state)

BACKEND STORAGE  
  → In-memory MessagePersistence      (during connection)
  → /data/A1/[convId]/                (file system)
  → NOT PERSISTENT between restarts

DATA STRUCTURE
  convId format:   "conv_[timestamp]_[random]"
  Project ID:      "A1" (hardcoded)
  Server port:     5040
  WebSocket URL:   ws://localhost:5040/api/ws?convId=[id]

MESSAGE TYPES
  Frontend:        Message { id, role, content, createdAt, ... }
  Backend:         ChatCompletionMessageParam (OpenAI format)
  WebSocket:       WSMessage { type, id, data, metadata }
  
PERSISTENCE CHAIN
  User types → Zustand → localStorage → WSClient → 
  Backend → MessagePersistence → (Currently lost on restart!)
```

## Common Issues and Solutions

**I can't find where messages are saved after server restart**
→ See CHAT_ARCHITECTURE.md section 11, point 2: "Backend relies on in-memory MessagePersistence - lost on server restart"

**I need to understand conversation initialization**
→ See DATA_FLOW.md section 2: "New Client Connection and History Load Flow"

**I need to add a new feature**
→ See QUICK_REFERENCE.md section "To add a new feature"

**I want to implement user authentication**
→ See QUICK_REFERENCE.md section "To implement user authentication"

**I need to understand how streaming works**
→ See DATA_FLOW.md section 1 steps 4-8, and CHAT_ARCHITECTURE.md section 7

## Architecture at a Glance

```
FRONTEND                    WEBSOCKET                   BACKEND
┌──────────────────┐       Connection              ┌──────────────────┐
│ React + Vite     │────────────────────────────→  │ Bun Server       │
│ Zustand Store    │                               │ WebSocket Server │
│ localStorage     │←────────────────────────────  │ OpenAI LLM       │
└──────────────────┘       Bidirectional           │ Tools            │
                                                    │ File Storage     │
                                                    │ Message History  │
                                                    └──────────────────┘
                                                           │
                                                           ↓
                                                   /data/A1/[convId]/
                                                   ├─ todos.json
                                                   ├─ info.json
                                                   ├─ files/
                                                   └─ (history.json missing!)
```

## Important Absolute Paths

### Frontend Source
- `/Users/riz/Developer/aibase/frontend/src/stores/chat-store.ts`
- `/Users/riz/Developer/aibase/frontend/src/hooks/use-chat.ts`
- `/Users/riz/Developer/aibase/frontend/src/lib/ws/ws-client.ts`
- `/Users/riz/Developer/aibase/frontend/src/lib/conv-id.ts`
- `/Users/riz/Developer/aibase/frontend/src/components/ui/chat/messages/types.ts`

### Backend Source
- `/Users/riz/Developer/aibase/backend/src/ws/entry.ts`
- `/Users/riz/Developer/aibase/backend/src/llm/conversation.ts`
- `/Users/riz/Developer/aibase/backend/src/ws/msg-persistance.ts`
- `/Users/riz/Developer/aibase/backend/src/storage/file-storage.ts`
- `/Users/riz/Developer/aibase/backend/src/server/index.ts`

### Data Directory
- `/Users/riz/Developer/aibase/backend/data/A1/` (project data)
- `/Users/riz/Developer/aibase/backend/data/A1/[convId]/` (conversation data)

## Reading Order

1. **For Overview**: ARCHITECTURE_GUIDE.md (5 min)
2. **For Understanding**: CHAT_ARCHITECTURE.md sections 1-5 (15 min)
3. **For Implementation**: QUICK_REFERENCE.md + relevant DATA_FLOW section (10 min)
4. **For Deep Dive**: CHAT_ARCHITECTURE.md full read (30 min)

## Updates and Maintenance

These documents were created December 1, 2025 and should be updated when:
- Major architectural changes occur
- New storage mechanisms are implemented
- Message types are added/modified
- File structure changes
- Server/client communication protocol changes

Last updated: December 1, 2025

---

**Pro Tip**: Use your editor's search function across these files. Example:
- Search for "MessagePersistence" to find all persistence-related code
- Search for "broadcastToConv" to find all broadcasting
- Search for "convId" to understand conversation ID flow

