/**
 * Simple test to verify streaming is working
 */

import { WSClient } from './src/orpc/client';

async function testStreaming() {
  console.log('Testing WebSocket streaming...\n');

  const ws = new WSClient(crypto.randomUUID(), 'ws://localhost:3000/ws');

  try {
    // Connect
    console.log('Connecting...');
    await ws.connect();
    console.log('Connected! Conversation ID:', ws.id, '\n');

    // Test streaming - should see chunks appear gradually
    console.log('Sending message with streaming...');
    console.log('Response (watch for gradual appearance):');
    console.log('---');

    const startTime = Date.now();
    let chunkCount = 0;
    let firstChunkTime = 0;

    for await (const chunk of ws.sendMessage('Count from 1 to 5, one number per line')) {
      if (chunkCount === 0) {
        firstChunkTime = Date.now() - startTime;
      }
      chunkCount++;
      process.stdout.write(chunk);
    }

    const totalTime = Date.now() - startTime;
    console.log('\n---');
    console.log(`\nStats:`);
    console.log(`- Total chunks: ${chunkCount}`);
    console.log(`- First chunk arrived: ${firstChunkTime}ms`);
    console.log(`- Total time: ${totalTime}ms`);

    if (chunkCount > 1 && firstChunkTime < totalTime) {
      console.log('\n✓ Streaming is working! Chunks arrived gradually.');
    } else {
      console.log('\n✗ Streaming may not be working - all chunks arrived at once.');
    }

    // Test other methods
    console.log('\nTesting other Conversation methods...');
    const isProc = await ws.isProcessing();
    console.log('Is processing:', isProc);

    const history = await ws.getHistory();
    console.log('History length:', history.length);

    // Disconnect
    ws.disconnect();
    console.log('\nDisconnected');

  } catch (error) {
    console.error('Error:', error);
    ws.disconnect();
    process.exit(1);
  }
}

testStreaming().then(() => process.exit(0));
