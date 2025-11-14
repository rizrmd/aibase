# AI Conversation CLI

A beautiful, interactive command-line interface for AI conversations built with [Ink](https://github.com/vadimdemedes/ink).

## Features

- 🎨 **Beautiful UI** - Rich terminal interface with colors and formatting
- 💬 **Interactive Chat** - Real-time streaming conversations with AI
- 📜 **Conversation History** - View and manage past conversations
- 💾 **Persistent Storage** - All conversations saved to database
- 🔄 **Resume Conversations** - Pick up where you left off
- ⚡ **Fast & Responsive** - Built on Bun and WebSocket

## Prerequisites

Make sure the server is running:

```bash
bun run orpc:dev
```

## Usage

### Interactive Mode (Recommended)

Start the interactive conversation list:

```bash
bun run cli:interactive
```

This shows a menu where you can:
- Browse recent conversations
- Create new conversations
- Select and continue existing chats

### Command Mode

Use specific commands directly:

#### 1. List Conversations

```bash
bun run cli list
```

Shows all your recent conversations with titles and last updated dates.

#### 2. Start a Chat

```bash
# Create new conversation
bun run cli chat

# Continue existing conversation
bun run cli chat --id chat-123

# Custom server
bun run cli chat --ws ws://example.com:3000/ws
```

In chat mode:
- Type your message and press Enter to send
- AI responses stream in real-time
- Type `exit` or `quit` to return to conversation list
- Press `Ctrl+C` to force exit

#### 3. View History

```bash
# View conversation history
bun run cli history --id chat-123

# Custom server
bun run cli history --id chat-123 --url http://example.com:3000
```

#### 4. Help

```bash
bun run cli help
```

## Commands Reference

### Global Options

- `--url <url>` - HTTP API URL (default: `http://localhost:3000`)
- `--ws <url>` - WebSocket URL (default: `ws://localhost:3000/ws`)

### Commands

| Command | Description | Options |
|---------|-------------|---------|
| (default) | Interactive conversation list | - |
| `list` | List all conversations | `--url` |
| `chat` | Start or continue a chat | `--id`, `--ws` |
| `history` | View conversation history | `--id`, `--url` |
| `help` | Show help message | - |

## Examples

### Basic Workflow

```bash
# 1. Start the server
bun run orpc:dev

# 2. Open the CLI (in another terminal)
bun run cli:interactive

# 3. Select "Create New Conversation" or choose an existing one

# 4. Chat with the AI
> What is the weather like?
🤖 Assistant: I don't have access to real-time weather data...

# 5. Type 'exit' to return to conversation list
> exit
```

### Using Specific Conversation

```bash
# Start chat with specific ID
bun run cli chat --id my-project-chat

# View its history
bun run cli history --id my-project-chat
```

### Custom Server

```bash
# Connect to remote server
bun run cli chat --ws ws://api.example.com:3000/ws

# List conversations from remote server
bun run cli list --url http://api.example.com:3000
```

## Architecture

### Components

The CLI is built with modular React components:

#### `Chat.tsx`
- Real-time chat interface
- Streaming AI responses with spinner
- Message history display
- Text input with submit handling

#### `ConversationList.tsx`
- Browse recent conversations
- Create new conversation option
- Selectable list with arrow keys
- Shows title and last updated date

#### `History.tsx`
- View full conversation history
- Color-coded by role (user/assistant/system/tool)
- Scrollable message list

### Entry Points

#### `index.tsx`
Interactive mode with navigation between screens:
- List → Chat → Back to List
- Manages app state and screen transitions

#### `commands.tsx`
Command-line mode for direct commands:
- Parses CLI arguments
- Routes to appropriate component
- Single-purpose execution

## UI Design

### Colors

- **Cyan** - Headers, borders, branding
- **Blue** - User messages and prompts
- **Green** - AI assistant messages and success states
- **Yellow** - Warnings and system messages
- **Red** - Errors
- **Gray/Dim** - Help text and metadata

### Layout

```
┌─────────────────────────────────────┐
│  🤖 AI Conversation CLI             │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  💬 Recent Conversations            │
│  Select a conversation or create    │
└─────────────────────────────────────┘

  > ➕ Create New Conversation
    My Project Discussion (11/13/2025)
    Code Review Session (11/12/2025)

Use arrow keys, Enter to select, Ctrl+C to exit
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate lists |
| `Enter` | Select item / Send message |
| `Ctrl+C` | Exit / Force quit |
| `exit` / `quit` | Return to conversation list (in chat) |

## Tips

1. **Start Fresh**: Create a new conversation for each topic to keep context clean
2. **Resume Anytime**: All conversations are saved - just use the same ID
3. **Check History**: Use `history` command to review past conversations
4. **Interactive Mode**: Use `cli:interactive` for the best experience
5. **Multiple Terminals**: Run multiple CLI instances with different conversation IDs

## Troubleshooting

### "Cannot connect" error
- Make sure the server is running: `bun run orpc:dev`
- Check the server URL matches (default: `http://localhost:3000`)

### "Conversation not found"
- The conversation ID doesn't exist yet
- Create it by using `chat --id <new-id>`

### Terminal rendering issues
- Ensure your terminal supports ANSI colors
- Try resizing the terminal window
- Use a modern terminal (iTerm2, Windows Terminal, etc.)

### Spinner not animating
- Some terminals don't support certain spinner types
- The functionality still works even if spinner is static

## Development

### Project Structure

```
src/cli/
├── index.tsx              # Interactive mode entry
├── commands.tsx           # Command mode entry
├── components/
│   ├── Chat.tsx          # Chat interface
│   ├── ConversationList.tsx  # List view
│   └── History.tsx       # History view
└── README.md             # This file
```

### Adding New Commands

1. Create a new component in `components/`
2. Add command handler in `commands.tsx`
3. Update help text
4. Add navigation in `index.tsx` if needed

### Customizing

Modify the components to:
- Change colors and styling
- Add new features (search, export, etc.)
- Customize AI system prompts
- Add authentication

## Built With

- [Ink](https://github.com/vadimdemedes/ink) - React for CLIs
- [ink-text-input](https://github.com/vadimdemedes/ink-text-input) - Text input
- [ink-select-input](https://github.com/vadimdemedes/ink-select-input) - Select menus
- [ink-spinner](https://github.com/vadimdemedes/ink-spinner) - Loading spinners
- [React](https://react.dev/) - UI framework
- [Bun](https://bun.sh/) - JavaScript runtime

## License

ISC
