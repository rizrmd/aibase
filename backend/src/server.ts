import { Agent, run } from '@openai/agents';
import type { ServerWebSocket } from 'bun';

/**
 * WebSocket Conversation Backend using Bun and OpenAI Agents
 *
 * This server provides real-time conversation capabilities via WebSocket.
 */

// Message types for client-server communication
interface ClientMessage {
  type: 'message' | 'ping';
  content?: string;
  conversationId?: string;
}

interface ServerMessage {
  type: 'message' | 'error' | 'pong' | 'connected';
  content?: string;
  conversationId?: string;
  timestamp?: number;
}

// Store conversation history per connection
const conversations = new Map<string, Array<{ role: string; content: string }>>();

// Create the AI agent
const agent = new Agent({
  name: 'ConversationAssistant',
  instructions: 'You are a helpful AI assistant. Engage in natural conversation with users, answer their questions, and provide helpful information.',
  model: 'gpt-4o-mini',
});

const server = Bun.serve<{ conversationId: string }>({
  port: process.env.PORT || 3000,

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const conversationId = crypto.randomUUID();
      const success = server.upgrade(req, {
        data: { conversationId }
      });

      if (success) {
        return undefined;
      }

      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Serve a simple test page
    if (url.pathname === '/') {
      return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Conversation WebSocket</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 800px;
      height: 600px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
    }
    .header h1 { font-size: 24px; margin-bottom: 5px; }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      background: rgba(255,255,255,0.2);
      font-size: 12px;
      margin-top: 8px;
    }
    .status.connected { background: rgba(76, 217, 100, 0.8); }
    .status.disconnected { background: rgba(255, 59, 48, 0.8); }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .message {
      margin-bottom: 16px;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .message-content {
      display: inline-block;
      padding: 12px 16px;
      border-radius: 18px;
      max-width: 70%;
      word-wrap: break-word;
    }
    .message.user {
      text-align: right;
    }
    .message.user .message-content {
      background: #667eea;
      color: white;
    }
    .message.assistant .message-content {
      background: white;
      color: #333;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .message.system {
      text-align: center;
    }
    .message.system .message-content {
      background: #e0e0e0;
      color: #666;
      font-size: 13px;
    }
    .input-area {
      padding: 20px;
      background: white;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 10px;
    }
    input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #667eea;
    }
    button {
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 24px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 AI Conversation</h1>
      <span class="status disconnected" id="status">Disconnected</span>
    </div>
    <div class="messages" id="messages"></div>
    <div class="input-area">
      <input type="text" id="input" placeholder="Type your message..." disabled />
      <button id="send" disabled>Send</button>
    </div>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const statusSpan = document.getElementById('status');

    let ws;
    let conversationId;

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = \`message \${role}\`;
      div.innerHTML = \`<div class="message-content">\${escapeHtml(content)}</div>\`;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function updateStatus(connected) {
      if (connected) {
        statusSpan.textContent = 'Connected';
        statusSpan.className = 'status connected';
        input.disabled = false;
        sendBtn.disabled = false;
      } else {
        statusSpan.textContent = 'Disconnected';
        statusSpan.className = 'status disconnected';
        input.disabled = true;
        sendBtn.disabled = true;
      }
    }

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${window.location.host}/ws\`);

      ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);

        if (data.type === 'connected') {
          conversationId = data.conversationId;
          addMessage('system', 'Connected to AI assistant');
        } else if (data.type === 'message') {
          addMessage('assistant', data.content);
        } else if (data.type === 'error') {
          addMessage('system', 'Error: ' + data.content);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addMessage('system', 'Connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateStatus(false);
        addMessage('system', 'Disconnected from server');
        setTimeout(connect, 3000);
      };
    }

    function sendMessage() {
      const message = input.value.trim();
      if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;

      addMessage('user', message);

      ws.send(JSON.stringify({
        type: 'message',
        content: message,
        conversationId
      }));

      input.value = '';
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    connect();
  </script>
</body>
</html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    return new Response('Not found', { status: 404 });
  },

  websocket: {
    open(ws) {
      const { conversationId } = ws.data;
      console.log(`[${conversationId}] Client connected`);

      // Initialize conversation history
      conversations.set(conversationId, []);

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        conversationId,
        timestamp: Date.now()
      } as ServerMessage));
    },

    async message(ws, message) {
      const { conversationId } = ws.data;

      try {
        const data: ClientMessage = JSON.parse(message.toString());

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() } as ServerMessage));
          return;
        }

        if (data.type === 'message' && data.content) {
          console.log(`[${conversationId}] User: ${data.content}`);

          // Get conversation history
          const history = conversations.get(conversationId) || [];

          // Add user message to history
          history.push({ role: 'user', content: data.content });

          // Check if API key is set
          if (!process.env.OPENAI_API_KEY) {
            ws.send(JSON.stringify({
              type: 'error',
              content: 'OPENAI_API_KEY not configured on server',
              timestamp: Date.now()
            } as ServerMessage));
            return;
          }

          // Run the agent with conversation history
          const result = await run(agent, data.content, {
            // Note: The @openai/agents SDK handles conversation context internally
            // For multi-turn conversations, you might need to maintain state differently
          });

          const assistantMessage = result.finalOutput;

          // Add assistant response to history
          history.push({ role: 'assistant', content: assistantMessage });
          conversations.set(conversationId, history);

          console.log(`[${conversationId}] Assistant: ${assistantMessage}`);

          // Send response to client
          ws.send(JSON.stringify({
            type: 'message',
            content: assistantMessage,
            conversationId,
            timestamp: Date.now()
          } as ServerMessage));
        }
      } catch (error) {
        console.error(`[${conversationId}] Error:`, error);
        ws.send(JSON.stringify({
          type: 'error',
          content: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        } as ServerMessage));
      }
    },

    close(ws) {
      const { conversationId } = ws.data;
      console.log(`[${conversationId}] Client disconnected`);

      // Clean up conversation history
      conversations.delete(conversationId);
    },
  },
});

console.log('');
console.log('🚀 WebSocket Conversation Server Started');
console.log(`📡 WebSocket: ws://localhost:${server.port}/ws`);
console.log(`🌐 Web Client: http://localhost:${server.port}/`);
console.log(`❤️  Health Check: http://localhost:${server.port}/health`);
console.log('');

if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️  Warning: OPENAI_API_KEY not set. Conversations will fail.');
  console.warn('   Set it with: export OPENAI_API_KEY=your-api-key');
  console.log('');
}
