/**
 * Example usage of oRPC + WebSocket conversation server
 *
 * Make sure the server is running first:
 * bun run orpc:dev
 *
 * Then run this example:
 * bun run orpc:example
 */

import { createClient, WSClient } from './client';

async function httpExample() {
  console.log('=== HTTP Client Example ===\n');

  const client = createClient('http://localhost:3000');

  try {
    // Create a conversation
    console.log('1. Creating conversation...');
    const createResult = await client.conversation.create({
      conversationId: 'example-http-1',
      systemPrompt: 'You are a helpful assistant that gives short, concise answers.',
      temperature: 0.7,
    });
    console.log('Created:', createResult);

    // Send a message
    console.log('\n2. Sending message...');
    const messageResult = await client.conversation.sendMessage({
      conversationId: 'example-http-1',
      message: 'What is 2 + 2?',
    });
    console.log('Response:', messageResult.response);

    // Get history
    console.log('\n3. Getting conversation history...');
    const history = await client.conversation.getHistory({
      conversationId: 'example-http-1',
    });
    console.log('History length:', history.history.length);
    console.log('Messages:', history.history.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.substring(0, 50) : m.content,
    })));

    // List conversations
    console.log('\n4. Listing all conversations...');
    const list = await client.conversation.list();
    console.log('Total conversations:', list.total);
    console.log('Conversations:', list.conversations);

    // Clear history
    console.log('\n5. Clearing history...');
    const clearResult = await client.conversation.clearHistory({
      conversationId: 'example-http-1',
      keepSystemPrompt: true,
    });
    console.log('Cleared:', clearResult);

    // Delete conversation
    console.log('\n6. Deleting conversation...');
    const deleteResult = await client.conversation.delete({
      conversationId: 'example-http-1',
    });
    console.log('Deleted:', deleteResult);

  } catch (error) {
    console.error('HTTP Error:', error);
  }
}

async function websocketExample() {
  console.log('\n\n=== WebSocket Client Example ===\n');

  const ws = new WSClient(crypto.randomUUID(), 'ws://localhost:3000/ws');

  try {
    // Connect
    console.log('1. Connecting to WebSocket...');
    await ws.connect();
    console.log('Connected! Conversation ID:', ws.id);

    // Example 1: Streaming (mirrors Conversation.sendMessage())
    console.log('\n2. Sending message (streaming)...');
    console.log('Response: ');
    for await (const chunk of ws.sendMessage('Count from 1 to 5')) {
      process.stdout.write(chunk);
    }
    console.log('\n');

    // Example 2: Get history (mirrors Conversation.history getter)
    console.log('3. Getting conversation history...');
    const history = await ws.getHistory();
    console.log('History length:', history.length);
    console.log('Last message:', history[history.length - 1]);

    // Example 3: Check if processing
    console.log('\n4. Checking if processing...');
    const isProc = await ws.isProcessing();
    console.log('Is processing:', isProc);

    // Example 4: Clear history
    console.log('\n5. Clearing history...');
    await ws.clearHistory();
    const newHistory = await ws.getHistory();
    console.log('History length after clear:', newHistory.length);

    // Ping test
    console.log('\n6. Testing ping...');
    ws.ping();
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('Ping sent');

    // Disconnect
    console.log('\n7. Disconnecting...');
    ws.disconnect();
    console.log('Disconnected');

  } catch (error) {
    console.error('WebSocket Error:', error);
    ws.disconnect();
  }
}

async function main() {
  console.log('oRPC + WebSocket Conversation Example\n');
  console.log('Make sure the server is running on http://localhost:3000');
  console.log('Run: bun run orpc:dev\n');

  // Wait a bit for user to start server if needed
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run HTTP example
  await httpExample();

  // Run WebSocket example
  await websocketExample();

  console.log('\n=== Example completed! ===\n');
  process.exit(0);
}

main();
