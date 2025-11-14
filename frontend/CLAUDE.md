# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---
description: Frontend SvelteKit application with shadcn-svelte UI components
globs: "*.svelte, *.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: true
---

## Technology Stack

This is a **SvelteKit 2** application using:
- **Svelte 5** (latest) with runes-based reactivity (`$props()`, `$state()`, `$derived()`)
- **TypeScript** (strict mode enabled)
- **Tailwind CSS v4** with custom Vite plugin
- **shadcn-svelte** for UI components (Zinc theme, New York style)
- **Vite 7** as build tool

## Development Commands

Use **Bun** instead of npm/pnpm/yarn (per parent CLAUDE.md):

```bash
# Development
bun run dev              # Start dev server (http://localhost:5173)
bun run dev -- --open    # Start dev server and open browser

# Building
bun run build            # Create production build
bun run preview          # Preview production build

# Code Quality
bun run check            # TypeScript + Svelte type checking
bun run check:watch      # Type checking in watch mode
bun run format           # Auto-format with Prettier
bun run lint             # Check code formatting

# Dependencies
bun install              # Install dependencies
bun add <package>        # Add dependency
bun add -d <package>     # Add dev dependency
```

## Architecture

### File-Based Routing
SvelteKit uses file-based routing in `src/routes/`:
- `+page.svelte` - Page components
- `+layout.svelte` - Layout wrappers
- `+server.ts` - API endpoints (for backend proxy/SSR)
- `+page.ts` - Client-side load functions
- `+page.server.ts` - Server-side load functions

### Import Aliases
- `$lib/*` → `src/lib/*` (components, utilities, shared code)
- `$app/*` → SvelteKit runtime modules
- `$env/*` → Environment variables

### Component Structure
```svelte
<script lang="ts">
  // Svelte 5 runes syntax
  let { children, ...props } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<div {...props}>
  {@render children()}
</div>
```

## UI Components (shadcn-svelte)

### Adding Components
```bash
# Install individual components
bunx shadcn-svelte@latest add button
bunx shadcn-svelte@latest add card
bunx shadcn-svelte@latest add input

# Browse all components
# https://www.shadcn-svelte.com/docs/components
```

### Component Configuration
- **Theme**: Zinc (neutral gray)
- **Style**: New York
- **Location**: `src/lib/components/ui/`
- **Utilities**: `src/lib/utils.ts` (cn helper for class merging)

### Design Tokens
CSS variables in `src/app.css`:
- Light/dark mode support via `.dark` class
- HSL color system with alpha values
- Theme tokens: `--background`, `--foreground`, `--primary`, etc.

## Backend Integration

The backend is a **Bun + oRPC + WebSocket server** at `http://localhost:3000`:

### Backend Endpoints
- `http://localhost:3000/orpc/*` - oRPC procedures (type-safe RPC)
- `ws://localhost:3000/ws` - WebSocket for streaming conversations
- `http://localhost:3000/health` - Health check

### Backend Scripts
```bash
cd ../backend
bun run orpc:dev         # Start oRPC server with hot reload
bun run cli              # Start React Ink CLI client
```

### Integration Pattern
Create oRPC client in `src/lib/api/`:
```typescript
// src/lib/api/client.ts
import { createClient } from '@orpc/client';
import type { Router } from '../../../backend/src/orpc/router';

export const client = createClient<Router>({
  baseURL: 'http://localhost:3000/orpc'
});
```

WebSocket service for streaming:
```typescript
// src/lib/services/websocket.ts
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => {
  const chunk = JSON.parse(event.data);
  // Handle streaming chunks
};
```

## Code Style

### Prettier Configuration
- **Tabs** for indentation
- **Single quotes**
- **No trailing commas**
- **100 character** line width
- Tailwind class sorting enabled

### TypeScript
- Strict mode enabled
- Bundler module resolution
- Do NOT include `.js` extensions in imports

### Svelte Patterns
- Use Svelte 5 runes (`$props`, `$state`, `$derived`) instead of legacy syntax
- Use `{@render children()}` for component composition
- Prefer `$lib` alias for internal imports

## Testing

Not yet configured. When adding tests, use:
```bash
bun test              # Run tests
```

## Important Notes

1. **Bun only**: Always use `bun` commands, not npm/yarn/pnpm
2. **No .js extensions**: When importing, don't include `.js` (per parent CLAUDE.md)
3. **Svelte 5 syntax**: Use runes, not legacy `$:` reactive statements
4. **SvelteKit conventions**: Follow `+page.svelte`, `+layout.svelte` naming
5. **shadcn-svelte**: Install components as needed, don't create custom versions
6. **Backend coordination**: Backend runs on port 3000, frontend on 5173
