import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { createClient } from '../../orpc/client';

interface HistoryProps {
  conversationId: string;
  httpUrl?: string;
  onBack: () => void;
}

export const History: React.FC<HistoryProps> = ({ conversationId, httpUrl = 'http://localhost:3000', onBack }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const client = createClient(httpUrl);

    client.conversation
      .getHistory({ conversationId })
      .then((result) => {
        setHistory(result.history);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [conversationId, httpUrl]);

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' Loading history...'}
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" flexDirection="column" padding={1}>
        <Text bold color="cyan">
          📜 Conversation History: {conversationId}
        </Text>
        <Text dimColor>
          {history.length} message{history.length !== 1 ? 's' : ''}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {history.length === 0 ? (
          <Text dimColor>No messages yet</Text>
        ) : (
          history.map((msg, idx) => (
            <Box key={idx} flexDirection="column" marginTop={idx > 0 ? 1 : 0} paddingX={1}>
              <Text bold color={msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'yellow'}>
                {msg.role === 'user' && '👤 User'}
                {msg.role === 'assistant' && '🤖 Assistant'}
                {msg.role === 'system' && '⚙️  System'}
                {msg.role === 'tool' && '🔧 Tool'}:
              </Text>
              <Text wrap="wrap">{msg.content || '[No content]'}</Text>
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Press Ctrl+C to go back</Text>
      </Box>
    </Box>
  );
};
