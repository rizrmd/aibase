import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { createClient } from '../../orpc/client';

interface ConversationListProps {
  onSelect: (conversationId: string) => void;
  onCreateNew: () => void;
  httpUrl?: string;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  onSelect,
  onCreateNew,
  httpUrl = 'http://localhost:3000',
}) => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const client = createClient(httpUrl);

    client.conversation
      .list({ limit: 20 })
      .then((result) => {
        setConversations(result.conversations);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [httpUrl]);

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' Loading conversations...'}
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Make sure the server is running at {httpUrl}</Text>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  const items = [
    {
      label: '➕ Create New Conversation',
      value: '__new__',
    },
    ...conversations.map((conv) => ({
      label: `${conv.title || 'Untitled'} (${new Date(conv.updatedAt).toLocaleDateString()})`,
      value: conv.conversationId,
    })),
  ];

  if (items.length === 1) {
    // Only "Create New" option
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="yellow" flexDirection="column" padding={1}>
          <Text bold color="yellow">
            📭 No conversations yet
          </Text>
          <Text>Press Enter to create your first conversation!</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput
            items={items}
            onSelect={(item) => {
              if (item.value === '__new__') {
                onCreateNew();
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" flexDirection="column" padding={1}>
        <Text bold color="cyan">
          💬 Recent Conversations
        </Text>
        <Text dimColor>Select a conversation or create a new one</Text>
      </Box>

      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === '__new__') {
              onCreateNew();
            } else {
              onSelect(item.value);
            }
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Use arrow keys to navigate, Enter to select, Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};
