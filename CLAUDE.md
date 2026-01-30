# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Quick Start
The start binary automatically manages runtime, dependencies, and services:
```bash
# macOS
./start.macos

# Linux
./start.linux

# Windows
start.win.exe
```

The binary handles:
- Bun runtime management
- Qdrant vector database (ports 6333/6334)
- Dependency installation
- Frontend builds
- Service startup on port 5040

### Development Mode (Hot-Reload)
```bash
# Terminal 1: Backend
cd backend && bun run src/server/index.ts

# Terminal 2: Frontend
cd frontend && bun run dev

# Or use the convenience script:
./dev.sh  # Runs both concurrently
```

### Frontend Commands
```bash
cd frontend
bun run dev      # Start Vite dev server
bun run build    # TypeScript check + Vite build
bun run lint     # Run ESLint
bun run preview  # Preview production build
```

### Backend Commands
```bash
cd backend
bun run src/server/index.ts  # Start backend server
bun run start                # Alias for above
```

### Database & User Management
```bash
# Create root user (first-time setup)
bun run backend/src/scripts/create-root-user.ts <email> <username> <password>

# Example:
bun run backend/src/scripts/create-root-user.ts admin@example.com admin MySecurePassword123
```

## Architecture Overview

### High-Level Structure
AIBase is a multi-tenant AI conversation system with real-time WebSocket communication, vector storage, and extensible tool system.

```
aibase/
├── backend/           # Bun + TypeScript WebSocket server
│   ├── src/
│   │   ├── llm/       # OpenAI integration, conversation management
│   │   ├── ws/        # WebSocket server (WSServer), message handling
│   │   ├── tools/     # LLM tool definitions (file, todo, script, memory)
│   │   ├── storage/   # SQLite persistence (projects, users, tenants)
│   │   ├── services/  # Business logic (auth, sessions)
│   │   ├── server/    # HTTP handlers, API routes
│   │   └── middleware/# Rate limiting, auth
├── frontend/          # React + Vite SPA
│   └── src/
│       ├── components/# UI components (pages, layout, project, ui)
│       ├── stores/    # Zustand state management
│       ├── hooks/     # React hooks
│       └── lib/       # WebSocket client, API utilities, types
├── data/              # Runtime data (logs, SQLite DBs, vector storage)
└── bins/start/        # Go source for start binary
```

### Core Architectural Patterns

#### 1. WebSocket Communication (Bidirectional Streaming)
- **Backend**: `WSServer` class in `backend/src/ws/entry.ts` manages connections
- **Frontend**: `WSClient` in `frontend/src/lib/ws/` handles real-time communication
- **Message Types**: `user_message`, `control`, `llm_chunk`, `llm_complete`, `tool_call`, `tool_result`
- **Multi-client sync**: All connections for a conversation ID receive broadcasts
- **Streaming manager**: Accumulates chunks for new connections joining active streams

#### 2. Conversation Management
- **`Conversation` class**: `backend/src/llm/conversation.ts` wraps OpenAI API
- **History persistence**: Auto-saved to `data/{projectId}/{convId}/chat.jsonl`
- **Compaction**: Automatic token-saving when history exceeds limits
- **Title generation**: AI-generated after first user-assistant exchange

#### 3. Multi-Tenant Architecture
- **Tenants**: `TenantStorage` stores organizations (domain, logo)
- **Users**: Belong to tenants, role-based access (admin, user)
- **Projects**: Scoped to tenants, isolated conversation spaces
- **Authentication**: Session-based tokens, validated via `AuthService`
- **Embed mode**: Public projects with token-based access, optional uid identification

#### 4. Tool System
LLM can call functions during conversation:
- **FileTool**: File upload/download in conversation context
- **TodoTool**: Task list management
- **ScriptTool**: Execute queries (PostgreSQL, ClickHouse, DuckDB, Trino, web search)
- **MemoryTool**: Project-scoped persistent key-value storage
- **Extensions**: Custom tools via `backend/src/tools/extensions/`

Tool hooks broadcast execution status to all connected clients.

#### 5. Frontend State Management (Zustand)
Stores in `frontend/src/stores/`:
- `useChatStore`: Messages, WebSocket, streaming state
- `useUIStore`: Dialogs, highlights, interaction state
- `useFileStore`: File attachments, upload progress
- `useAudioStore`: Voice recording, transcription
- `useAuthStore`: Authentication, session management
- `useProjectStore`: Active project, project list
- `useConversationStore`: Conversation list, history
- `useAdminStore`: User/tenant management (admin only)

#### 6. Data Persistence
- **SQLite**: Users, sessions, tenants, projects (`data/users.db`)
- **JSONL**: Conversation history (`data/{projectId}/{convId}/chat.jsonl`)
- **JSON**: Conversation metadata (`data/{projectId}/{convId}/info.json`)
- **Qdrant**: Vector storage for embeddings (when configured)
- **Files**: Uploaded files (`data/{projectId}/{convId}/files/`)

### Important Conventions

#### Environment Configuration
Required `.env` variables (see `.env.example`):
- `OPENAI_API_KEY`: LLM provider credential
- `OPENAI_BASE_URL`: API endpoint (e.g., OpenRouter, Z.AI)
- `OPENAI_MODEL`: Model identifier
- `OPENAI_MAX_TOKEN`: Context limit
- `PUBLIC_BASE_PATH`: Subpath for reverse proxy deployments
- `APP_NAME`: Browser tab title

#### Routing & Base Path
- **Frontend**: React Router with dynamic base path from `PUBLIC_BASE_PATH`
- **Backend**: Strips base path via `stripBasePath()` before route matching
- **WebSocket**: Base path automatically prepended to `/api/ws`

#### Page Layout Standards
All pages must follow layout patterns to prevent navigation overlap (see `frontend/src/lib/layout-constants.ts`):
- Navigation offset: `60px` top padding (mobile)
- Horizontal padding: `16px` mobile, `24px` desktop
- Use `.h-screen-mobile` for full viewport height
- Standard pattern:
  ```tsx
  <div className="flex h-screen-mobile flex-col">
    <div className="flex-1 overflow-hidden">
      <div className="h-full px-4 pt-[60px] md:px-6 pb-4 overflow-y-auto">
        {/* Content */}
      </div>
    </div>
  </div>
  ```

#### Message IDs
- User messages: `user_{timestamp}_{random}`
- Assistant messages: `assistant_{timestamp}_{random}`
- Used for streaming synchronization and tool call association

#### Error Handling
- Frontend: Error states in stores, user-friendly toasts
- Backend: Error messages broadcast via WebSocket, proper HTTP status codes
- Abort handling: Graceful cleanup, partial response persistence

## First-Time Setup

1. **Configure environment**: Copy `.env.example` to `.env` and add API credentials
2. **Run start binary**: `./start.macos` (or platform equivalent)
3. **Create root user**: `bun run backend/src/scripts/create-root-user.ts ...`
4. **Access application**: Open http://localhost:5040

## Testing & Quality

- **Frontend lint**: `cd frontend && bun run lint`
- **Frontend build**: `cd frontend && bun run build` (includes TypeScript check)
- No automated tests currently - manual testing required

## Key Dependencies

### Backend
- `bun`: Runtime, SQLite, WebSocket server
- `openai`: LLM API client
- `pino`: Logging

### Frontend
- `react`: UI framework
- `vite`: Build tool
- `zustand`: State management
- `react-router-dom`: Routing
- `radix-ui`: Component primitives
- `tailwindcss`: Styling
- `codemirror`: Code editor
- `mermaid`: Diagrams
- `echarts`: Charts
