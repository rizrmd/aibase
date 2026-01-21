/**
 * WhatsApp WebSocket endpoint for real-time status updates
 */

import { upgradeWebSocket } from "hono/ws";

interface WhatsAppWSMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
  projectId?: string;
}

interface WhatsAppWSResponse {
  type: 'status' | 'qr_code' | 'connected' | 'disconnected' | 'error';
  data: {
    projectId: string;
    connected?: boolean;
    connectedAt?: string;
    qrCode?: string;
    deviceName?: string;
    error?: string;
  };
}

// Store active WebSocket connections per project
const projectConnections = new Map<string, Set<WebSocket>>();

let broadcastStatus = (projectId: string, data: WhatsAppWSResponse['data']) => {
  const connections = projectConnections.get(projectId);
  if (!connections) return;

  const message: WhatsAppWSResponse = {
    type: 'status',
    data: { projectId, ...data },
  };

  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
};

// Export for use by other modules
export function notifyWhatsAppStatus(projectId: string, status: WhatsAppWSResponse['data']) {
  broadcastStatus(projectId, status);
}

export function notifyWhatsAppQRCode(projectId: string, qrCode: string) {
  const connections = projectConnections.get(projectId);
  if (!connections) return;

  const message: WhatsAppWSResponse = {
    type: 'qr_code',
    data: { projectId, qrCode },
  };

  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

// WebSocket upgrade handler for WhatsApp status
export async function handleWhatsAppWebSocket(req: Request) {
  return upgradeWebSocket(req, {
    onError: () => {
      console.error('[WhatsApp WS] WebSocket error');
    },
    onMessage: (message, ws) => {
      try {
        const data: WhatsAppWSMessage = JSON.parse(message.toString());

        switch (data.type) {
          case 'subscribe':
            if (data.projectId) {
              console.log('[WhatsApp WS] Client subscribed for project:', data.projectId);
              // Add to project connections
              if (!projectConnections.has(data.projectId)) {
                projectConnections.set(data.projectId, new Set());
              }
              projectConnections.get(data.projectId)!.add(ws);

              // Send initial status
              ws.send(JSON.stringify({
                type: 'subscribed',
                projectId: data.projectId,
              } as WhatsAppWSResponse));
            }
            break;

          case 'unsubscribe':
            if (data.projectId) {
              console.log('[WhatsApp WS] Client unsubscribed from project:', data.projectId);
              const connections = projectConnections.get(data.projectId);
              if (connections) {
                connections.delete(ws);
                if (connections.size === 0) {
                  projectConnections.delete(data.projectId);
                }
              }
            }
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' } as WhatsAppWSResponse));
            break;
        }
      } catch (err) {
        console.error('[WhatsApp WS] Error handling message:', err);
      }

      return new Response("OK", { status: 200 });
    },
    onClose: () => {
      // Cleanup connection when closed
      for (const [projectId, connections] of projectConnections) {
        connections.delete(ws);
        if (connections.size === 0) {
          projectConnections.delete(projectId);
        }
      }
    },
  });
}
