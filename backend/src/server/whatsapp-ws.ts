/**
 * WhatsApp WebSocket endpoint for real-time status updates
 * Uses Bun's native WebSocket API
 */

interface WhatsAppWSMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
  projectId?: string;
}

interface WhatsAppWSResponse {
  type: 'status' | 'qr_code' | 'connected' | 'disconnected' | 'error' | 'subscribed';
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
const projectConnections = new Map<string, Set<any>>();

// Store WebSocket by socket for cleanup
const socketToProjects = new WeakMap<any, Set<string>>();

/**
 * Broadcast status to all subscribers of a project
 */
function broadcastStatus(projectId: string, data: Omit<WhatsAppWSResponse['data'], 'projectId'>) {
  const connections = projectConnections.get(projectId);
  if (!connections) {
    console.log('[WhatsApp WS] No connections found for project:', projectId);
    console.log('[WhatsApp WS] Active projects:', Array.from(projectConnections.keys()));
    return;
  }

  const message: WhatsAppWSResponse = {
    type: 'status',
    data: { projectId, ...data },
  };

  console.log('[WhatsApp WS] Broadcasting to', connections.size, 'connection(s) for project:', projectId);
  connections.forEach((ws) => {
    if (ws.readyState === 1) { // WebSocket.OPEN = 1
      ws.send(JSON.stringify(message));
    }
  });
}

/**
 * Broadcast QR code to all subscribers of a project
 */
function broadcastQRCode(projectId: string, qrCode: string) {
  const connections = projectConnections.get(projectId);
  if (!connections) return;

  const message: WhatsAppWSResponse = {
    type: 'qr_code',
    data: { projectId, qrCode },
  };

  connections.forEach((ws) => {
    if (ws.readyState === 1) { // WebSocket.OPEN = 1
      ws.send(JSON.stringify(message));
    }
  });
}

// Export for use by other modules (whatsapp-handler.ts)
export function notifyWhatsAppStatus(projectId: string, status: Omit<WhatsAppWSResponse['data'], 'projectId'>) {
  broadcastStatus(projectId, status);
}

export function notifyWhatsAppQRCode(projectId: string, qrCode: string) {
  broadcastQRCode(projectId, qrCode);
}

/**
 * Handle WebSocket connection open
 */
function handleOpen(ws: any) {
  console.log('[WhatsApp WS] New connection established');
}

/**
 * Handle WebSocket message
 */
async function handleMessage(ws: any, message: string | Buffer) {
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
          console.log('[WhatsApp WS] Connection added. Total connections for project:', projectConnections.get(data.projectId)!.size);

          // Track which projects this socket is subscribed to
          if (!socketToProjects.has(ws)) {
            socketToProjects.set(ws, new Set());
          }
          socketToProjects.get(ws)!.add(data.projectId);

          // Send subscribed confirmation
          ws.send(JSON.stringify({
            type: 'subscribed',
            projectId: data.projectId,
          }));

          // Fetch and send current WhatsApp client status
          try {
            const WHATSAPP_API_URL = "http://localhost:7031/api/v1";
            const response = await fetch(`${WHATSAPP_API_URL}/clients`);

            if (response.ok) {
              const clientsData = await response.json();
              const clientsArray = Array.isArray(clientsData) ? clientsData : clientsData.clients;
              const client = clientsArray?.find((c: any) => c.id === data.projectId);

              if (client) {
                const isConnected = client.isConnected || false;
                console.log('[WhatsApp WS] Sending current status to new subscriber:', {
                  projectId: data.projectId,
                  connected: isConnected,
                  deviceName: client.osName || 'WhatsApp Device',
                });

                // Send current status immediately
                ws.send(JSON.stringify({
                  type: 'status',
                  data: {
                    projectId: data.projectId,
                    connected: isConnected,
                    connectedAt: client.connectedAt,
                    deviceName: client.osName || 'WhatsApp Device',
                  },
                }));
              } else {
                console.log('[WhatsApp WS] No client found for project:', data.projectId);
              }
            }
          } catch (err) {
            console.error('[WhatsApp WS] Error fetching client status:', err);
          }
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

          // Remove from socket's project tracking
          const projects = socketToProjects.get(ws);
          if (projects) {
            projects.delete(data.projectId);
          }
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      default:
        console.warn('[WhatsApp WS] Unknown message type:', data.type);
    }
  } catch (err) {
    console.error('[WhatsApp WS] Error handling message:', err);
  }
}

/**
 * Handle WebSocket connection close
 */
function handleClose(ws: any) {
  console.log('[WhatsApp WS] Connection closed');

  // Cleanup connection from all projects
  const projects = socketToProjects.get(ws);
  if (projects) {
    for (const projectId of projects) {
      const connections = projectConnections.get(projectId);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          projectConnections.delete(projectId);
        }
      }
    }
    socketToProjects.delete(ws);
  }
}

/**
 * Get WebSocket handlers for Bun.serve()
 */
export function getWhatsAppWebSocketHandlers() {
  return {
    open: handleOpen,
    message: handleMessage,
    close: handleClose,
  };
}

// Export individual handlers for direct access
export { handleOpen as handleWhatsAppOpen, handleMessage as handleWhatsAppMessage, handleClose as handleWhatsAppClose };
