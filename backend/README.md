# Simple LLM Backend

A simple LLM backend implementation using the `@openai/agents` npm module with TypeScript.

## Features

- TypeScript support
- OpenAI Agents SDK integration
- Simple agent setup with customizable instructions
- Example implementation demonstrating agent usage

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or bun
- OpenAI API key

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables:
```bash
cp .env.example .env
```

3. Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=your-actual-api-key
```

## Usage

### Development Mode
Run the backend in development mode with hot reload:
```bash
npm run dev
```

### Build
Compile TypeScript to JavaScript:
```bash
npm run build
```

### Production Mode
Run the compiled JavaScript:
```bash
npm start
```

## Project Structure

```
backend/
├── src/
│   └── index.ts          # Main entry point
├── dist/                  # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Customization

The agent can be customized in `src/index.ts`:

```typescript
const agent = new Agent({
  name: 'YourAgentName',
  instructions: 'Your custom instructions here',
  model: 'gpt-4o-mini', // or 'gpt-4o', 'gpt-4-turbo', etc.
});
```

## Available Scripts

- `npm run dev` - Run in development mode with tsx
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run the built JavaScript
- `npm test` - Run tests (placeholder)

## Dependencies

- `@openai/agents` - OpenAI Agents SDK
- `openai` - OpenAI API client
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution engine
- `@types/node` - Node.js type definitions

## License

ISC
