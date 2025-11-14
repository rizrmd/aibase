/**
 * Debug version with logging
 */

import { WebSocket } from 'ws';

async function testStreaming() {
  console.log('Testing WebSocket streaming with debug...\n');

  const ws = new WebSocket('ws://localhost:3000/ws');

  ws.on('open', () => {
    console.log('WebSocket opened');

    // Send message using new protocol
    const conversationId = crypto.randomUUID();
    const msg = {
      method: 'sendMessage',
      conversationId,
      params: { message: 'Count from 1 to 3' }
    };
    console.log('Sending:', JSON.stringify(msg));
    ws.send(JSON.stringify(msg));
  });

  ws.on('message', (data) => {
    console.log('Received message:', data.toString());

    const parsed = JSON.parse(data.toString());

    if (parsed.streaming && parsed.chunk) {
      process.stdout.write(parsed.chunk);
    }

    if (parsed.streaming && parsed.done) {
      console.log('\n\nStream ended!');
      ws.close();
      process.exit(0);
    }

    if (parsed.error) {
      console.error('\nError:', parsed.error);
      ws.close();
      process.exit(1);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('WebSocket closed');
  });
}

testStreaming();

// Timeout after 10 seconds
setTimeout(() => {
  console.error('Test timed out');
  process.exit(1);
}, 10000);
