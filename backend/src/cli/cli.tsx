#!/usr/bin/env bun
import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Chat } from './components/Chat';
import { ConversationList } from './components/ConversationList';
import { History } from './components/History';
import { startServer } from '../orpc/server';
import type { Server } from 'bun';

// Check if we have a TTY
if (!process.stdin.isTTY) {
  console.error('❌ Error: This interactive CLI requires a TTY (terminal).');
  console.error('\nYou are running in a non-interactive environment.');
  console.error('\nPlease use the simple CLI instead:');
  console.error('  bun run cli:simple help\n');
  process.exit(1);
}

type Screen = 'list' | 'chat' | 'history';

interface AppState {
  screen: Screen;
  conversationId?: string;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({ screen: 'list' });
  const [server, setServer] = useState<Server | null>(null);
  const [isServerStarting, setIsServerStarting] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);

  // Start server on mount
  useEffect(() => {
    const initServer = async () => {
      try {
        // Check if server is already running
        const healthCheck = await fetch('http://localhost:3000/health').catch(() => null);

        if (healthCheck?.ok) {
          // Server already running
          setIsServerStarting(false);
          return;
        }

        // Start server
        const srv = startServer(3000);
        setServer(srv);

        // Wait a moment for server to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsServerStarting(false);
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'Failed to start server');
        setIsServerStarting(false);
      }
    };

    initServer();

    // Cleanup: stop server on unmount
    return () => {
      if (server) {
        server.stop();
      }
    };
  }, []);

  const handleSelectConversation = (conversationId: string) => {
    setState({ screen: 'chat', conversationId });
  };

  const handleCreateNew = () => {
    // Don't generate ID - let server do it
    setState({ screen: 'chat', conversationId: undefined });
  };

  const handleExit = () => {
    setState({ screen: 'list' });
  };

  const handleViewHistory = () => {
    if (state.conversationId) {
      setState({ ...state, screen: 'history' });
    }
  };

  if (isServerStarting) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' Starting server...'}
        </Text>
      </Box>
    );
  }

  if (serverError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error starting server: {serverError}</Text>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="bold" borderColor="cyan" padding={1} marginBottom={1}>
        <Text bold color="cyan">
          🤖 AI Conversation CLI
        </Text>
      </Box>

      {state.screen === 'list' && (
        <ConversationList onSelect={handleSelectConversation} onCreateNew={handleCreateNew} />
      )}

      {state.screen === 'chat' && (
        <Chat conversationId={state.conversationId} onExit={handleExit} />
      )}

      {state.screen === 'history' && state.conversationId && (
        <History conversationId={state.conversationId} onBack={handleExit} />
      )}
    </Box>
  );
};

// Start the CLI
const { unmount, waitUntilExit } = render(<App />);

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  unmount();
  process.exit(0);
});
