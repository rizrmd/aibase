/**
 * WebSocket Library for Bidirectional LLM Communication
 *
 * A modular TypeScript library for real-time bidirectional communication
 * between WebSocket clients and LLM conversation systems.
 */

// Export core classes
export { WSServer } from "../ws/entry";
export { WSEventEmitter, EventEmitter } from "../ws/events";

// Export types
export type {
  WSMessage,
  WSClientOptions,
  WSServerOptions,
  MessageType,
  ControlMessage,
  UserMessageData,
  LLMChunkData,
  ToolCallData,
  StatusData,
  ErrorData,
  MessageMetadata,
  ConnectionState,
  SessionInfo,
  ConnectionStats,
  EventHandler,
  ErrorEventHandler,
} from "../ws/types";

// Re-export Conversation and Tool from LLM module for convenience
export { Conversation, Tool } from "../llm/conversation";

// Import types for convenience functions
import type { WSClientOptions, WSServerOptions } from "../ws/types";
import { WSServer } from "../ws/entry";
import { handleFileUpload, handleFileDownload } from "./upload-handler";

/**
 * Convenience function to create a WebSocket server
 */
export function createWSServer(options?: WSServerOptions): WSServer {
  return new WSServer(options);
}

/**
 * Complete server options including Bun server configuration
 */
export interface ServerOptions extends WSServerOptions {
  /** Server port (default: 3000) */
  port?: number;
  /** Server hostname (default: 'localhost') */
  hostname?: string;
  /** Enable development mode with HMR */
  development?: boolean;
  /** Additional routes for the HTTP server */
  routes?: Record<string, any>;
}

/**
 * Complete WebSocket server with integrated Bun HTTP server
 */
export class WebSocketServer {
  private bunServer: any;
  private wsServer: WSServer;
  private options: Required<ServerOptions>;

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: 5040,
      hostname: "localhost",
      development: false,
      maxConnections: 100,
      heartbeatInterval: 30000,
      enableCompression: true,
      conversationOptions: {},
      routes: {},
      ...options,
    };

    this.wsServer = new WSServer({
      maxConnections: this.options.maxConnections,
      heartbeatInterval: this.options.heartbeatInterval,
      enableCompression: this.options.enableCompression,
      conversationOptions: this.options.conversationOptions,
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const wsHandlers = this.wsServer.getWebSocketHandlers();

    this.bunServer = Bun.serve({
      port: this.options.port,
      hostname: this.options.hostname,
      development: this.options.development,
      fetch: (req, server) => {
        const url = new URL(req.url);

        // Handle WebSocket upgrade requests
        if (url.pathname.startsWith("/api/ws")) {
          // Extract conversation ID from URL before upgrading
          const convId = url.searchParams.get("convId");

          // Pass conversation ID as data to WebSocket connection
          const upgraded = server.upgrade(req, {
            data: { convId }
          });
          if (upgraded) {
            return undefined; // WebSocket connection established
          }
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Handle file upload (POST /api/upload?convId=xxx)
        if (url.pathname === "/api/upload" && req.method === "POST") {
          return handleFileUpload(req);
        }

        // Handle file download (GET /api/files/{convId}/{fileName})
        if (url.pathname.startsWith("/api/files/") && req.method === "GET") {
          return handleFileDownload(req);
        }

        // Default routes
        if (url.pathname === "/") {
          return new Response(
            `
            <!DOCTYPE html>
            <html>
              <head>
                <title>WebSocket Server</title>
                <meta charset="utf-8">
              </head>
              <body>
                <h1>WebSocket Server Running</h1>
                <p>WebSocket endpoint: <code>ws://${this.options.hostname}:${this.options.port}/ws</code></p>
                <p>Chat endpoint: <code>ws://${this.options.hostname}:${this.options.port}/chat</code></p>
                <p>Health check: <a href="/health">/health</a></p>
              </body>
            </html>
          `,
            {
              headers: { "Content-Type": "text/html" },
            }
          );
        }

        if (url.pathname === "/health") {
          return Response.json({
            status: "healthy",
            timestamp: Date.now(),
            connections: this.wsServer.getConnectionCount(),
            sessions: this.wsServer.getActiveSessions().length,
          });
        }

        // Handle custom routes
        for (const [path, handler] of Object.entries(this.options.routes)) {
          if (url.pathname === path) {
            return handler(req);
          }
        }

        return new Response("Not Found", { status: 404 });
      },
      websocket: this.wsServer.getWebSocketHandlers(),
    });

    console.log(
      `WebSocket server started on http://${this.options.hostname}:${this.options.port}`
    );
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.bunServer) {
      this.bunServer.stop();
      this.bunServer = null;
    }

    await this.wsServer.stop();
  }

  /**
   * Get the underlying WebSocket server
   */
  getWebSocketServer(): WSServer {
    return this.wsServer;
  }

  /**
   * Get server info
   */
  getServerInfo() {
    return {
      hostname: this.options.hostname,
      port: this.options.port,
      connections: this.wsServer.getConnectionCount(),
      sessions: this.wsServer.getActiveSessions(),
      development: this.options.development,
    };
  }

  /**
   * Get Bun server instance (for advanced usage)
   */
  getBunServer() {
    return this.bunServer;
  }
}

/**
 * Convenience function to create and start a complete WebSocket server
 */
export async function createAndStartServer(
  options?: ServerOptions
): Promise<WebSocketServer> {
  const server = new WebSocketServer(options);
  await server.start();
  return server;
}

/**
 * Library version
 */
export const VERSION = "1.0.0";

// Always start server when this file is run
createAndStartServer();
