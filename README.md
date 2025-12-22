# AIBase

AI-powered conversation system with multi-tenant support and vector storage.

## Quick Start

1. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API credentials
   ```

2. **Run the application**
   ```bash
   # macOS
   ./start.macos

   # Linux
   ./start.linux

   # Windows
   start.win.exe
   ```

3. **Access the application**

   Open http://localhost:5040 in your browser

4. **Create the first root user** (first-time setup only)

   ```bash
   bun run backend/src/scripts/create-root-user.ts <email> <username> <password>

   # Example:
   bun run backend/src/scripts/create-root-user.ts admin@example.com admin MySecurePassword123
   ```

   After creating the root user, you can login and create additional users, tenants, and admins through the web interface.

## What the start binary does

The start binary automatically:
- Downloads and manages Bun runtime (if not present)
- Downloads and manages Qdrant vector database (if not present)
- Installs dependencies for backend and frontend
- Builds the frontend (only when source files change)
- Starts all required services:
  - Qdrant on ports 6333 (HTTP) and 6334 (gRPC)
  - Backend + Frontend on port 5040
- Logs all service output to `data/bins/*/logs/`

## Environment Variables

The `.env` file must be in the same folder as the start binary (project root).

See `.env.example` for required configuration.

## Development

For development with hot-reload:

```bash
# Terminal 1: Start Qdrant
./start.macos  # or build from bins/start/

# Terminal 2: Backend dev mode
cd backend
bun run dev

# Terminal 3: Frontend dev mode
cd frontend
bun run dev
```

## Building from Source

The start binaries are built from Go source code in `bins/start/`:

```bash
cd bins/start
./build.sh
```

This creates:
- `start.macos` - macOS binary (universal)
- `start.linux` - Linux binary (amd64)
- `start.win.exe` - Windows binary (amd64)

## Project Structure

```
aibase/
├── start.macos          # macOS start binary
├── start.linux          # Linux start binary
├── start.win.exe        # Windows start binary
├── .env                 # Environment configuration (create from .env.example)
├── backend/             # Backend server (WebSocket, API)
├── frontend/            # Frontend SPA (React + Vite)
├── bins/                # Binary management system
│   ├── start/          # Start binary source (Go)
│   ├── qdrant/         # Qdrant binary downloader
│   └── bun/            # Bun runtime (auto-downloaded)
└── data/                # Runtime data (logs, databases, vector storage)
```

## License

MIT
