# CLI Usage Guide

## The Problem

The interactive CLI (`cli:interactive`) uses [Ink](https://github.com/vadimdemedes/ink), which requires a TTY (terminal) to work. If you run it in a non-interactive environment (like Claude Code, CI/CD, or without a proper terminal), you'll get an `EIO: i/o error` because Ink cannot read from stdin.

## The Solution

Use the **simple CLI** instead, which works in any environment:

### Available Commands

```bash
# Show help
bun run cli:simple help

# Start a new chat
bun run cli:simple chat
bun run cli:chat        # shortcut

# Continue existing chat
bun run cli:simple chat <conversation-id>

# List all conversations
bun run cli:simple list
bun run cli:list        # shortcut

# View conversation history
bun run cli:simple history <conversation-id>
```

### Examples

```bash
# Start chatting
$ bun run cli:chat
💬 Starting chat: chat-1699564923456
Type your messages and press Enter. Type "exit" to quit.

✅ Connected!

👤 You: Hello!
🤖 Assistant: Hi! How can I help you today?

👤 You: exit
👋 Goodbye!
```

```bash
# List conversations
$ bun run cli:list
📋 Loading conversations...

Found 3 conversation(s):

1. My first chat
   ID: chat-1699564923456
   Updated: 11/13/2025, 10:30:00 AM

2. Project discussion
   ID: chat-1699565123789
   Updated: 11/13/2025, 11:15:30 AM
```

## Interactive CLI (Advanced)

The interactive CLI with a fancy UI is available if you have a proper TTY:

```bash
bun run cli:interactive
```

This will work in:
- Real terminal emulators (iTerm, Terminal.app, GNOME Terminal, etc.)
- SSH sessions with PTY allocation (`ssh -t`)
- Local development environments with TTY

This will NOT work in:
- Claude Code environment
- CI/CD pipelines
- Non-interactive shells
- Redirected stdin/stdout

## Environment Setup

Make sure you have:

1. `.env` file with your OpenAI API key:
   ```
   OPENAI_API_KEY=your-key-here
   DATABASE_URL=postgresql://localhost:5432/aibase
   ```

2. The server will start automatically when you use the CLI, or you can start it manually:
   ```bash
   bun run orpc:dev
   ```

## Troubleshooting

### "EIO: i/o error, read"
- You're trying to use the interactive CLI without a TTY
- Solution: Use `bun run cli:simple` instead

### "Server connection failed"
- The server isn't running
- Solution: Start it with `bun run orpc:dev` in another terminal

### "OPENAI_API_KEY not found"
- Your `.env` file is missing or doesn't have the API key
- Solution: Copy `.env.example` to `.env` and add your key
