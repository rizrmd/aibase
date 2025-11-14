import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { WSClient } from '../../orpc/client';

interface ChatProps {
  conversationId?: string;
  wsUrl?: string;
  onExit: () => void;
}

export const Chat: React.FC<ChatProps> = ({ conversationId, wsUrl = 'ws://localhost:3000/ws', onExit }) => {
  const [ws, setWs] = useState<WSClient | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const client = new WSClient(conversationId || crypto.randomUUID(), wsUrl);

    client
      .connect()
      .then(() => {
        setWs(client);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });

    // Handle Ctrl+C during conversation
    const handleSigInt = () => {
      client.disconnect();
    };
    process.on('SIGINT', handleSigInt);

    return () => {
      client.disconnect();
      process.off('SIGINT', handleSigInt);
    };
  }, [conversationId, wsUrl]);

  const handleSubmit = useCallback(async (value: string) => {
    if (!ws || !value.trim()) return;

    const userMessage = value.trim();
    setInput('');

    // If already responding, abort the current message and start new one
    if (isResponding) {
      ws.abort();
      setIsResponding(false);
      setCurrentResponse('');
    }

    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsResponding(true);
    setCurrentResponse('');

    try {
      // Collect full response from stream
      let fullResponse = '';
      for await (const chunk of ws.sendMessage(userMessage)) {
        fullResponse += chunk;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: fullResponse }]);
      setCurrentResponse('');
    } catch (err) {
      // Only show error if it's not an abort
      if (err instanceof Error && err.message !== 'Message aborted') {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setIsResponding(false);
    }
  }, [ws, isResponding]);

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' Connecting to conversation...'}
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
          💬 Conversation: {ws?.id || 'Loading...'}
        </Text>
        <Text dimColor>Type your message and press Enter. Type 'exit' or 'quit' to leave.</Text>
      </Box>

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {messages.map((msg, idx) => (
          <Box key={idx} flexDirection="column" marginTop={idx > 0 ? 1 : 0}>
            <Text bold color={msg.role === 'user' ? 'blue' : 'green'}>
              {msg.role === 'user' ? '👤 You' : '🤖 Assistant'}:
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        ))}

        {isResponding && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="green">
              🤖 Assistant:
            </Text>
            <Text>
              <Text color="green">
                <Spinner type="dots" />
              </Text>
              {' Thinking...'}
            </Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="blue">{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={(value) => {
            if (value.toLowerCase() === 'exit' || value.toLowerCase() === 'quit') {
              onExit();
            } else {
              handleSubmit(value);
            }
          }}
          placeholder="Type your message..."
          focus={true}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Ctrl+C to force exit</Text>
      </Box>
    </Box>
  );
};
