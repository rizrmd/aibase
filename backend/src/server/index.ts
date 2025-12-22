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
import { handleGetMemory, handleSetMemory, handleDeleteMemory } from "./memory-handler";
import { handleGetContext, handleUpdateContext, handleGetDefaultContext } from "./context-handler";
import {
  handleGetProjects,
  handleGetProject,
  handleCreateProject,
  handleUpdateProject,
  handleDeleteProject,
} from "./projects-handler";
import {
  handleGetConversations,
  handleGetConversationMessages,
  handleDeleteConversation,
} from "./conversations-handler";
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleGetCurrentUser,
  handleChangePassword,
  handleAdminCreateUser,
  handleAdminGetUsers,
  handleAdminDeleteUser,
} from "./auth-handler";
import {
  handleGetTenants,
  handleGetTenant,
  handleCreateTenant,
  handleUpdateTenant,
  handleDeleteTenant,
  handleUploadTenantLogo,
  handleGetTenantLogo,
  handleDeleteTenantLogo,
  handleGetTenantUsers,
  handleCreateTenantUser,
  handleUpdateTenantUser,
  handleDeleteTenantUser,
} from "./tenant-handler";

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
      hostname: "0.0.0.0",
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
      fetch: async (req, server) => {
        const url = new URL(req.url);

        // Handle WebSocket upgrade requests
        if (url.pathname.startsWith("/api/ws")) {
          // Extract conversation ID and project ID from URL before upgrading
          const convId = url.searchParams.get("convId");
          const projectId = url.searchParams.get("projectId");

          // Pass conversation ID and project ID as data to WebSocket connection
          const upgraded = server.upgrade(req, {
            data: { convId, projectId }
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

        // Memory API endpoints
        if (url.pathname === "/api/memory") {
          if (req.method === "GET") {
            return handleGetMemory(req);
          } else if (req.method === "POST") {
            return handleSetMemory(req);
          } else if (req.method === "DELETE") {
            return handleDeleteMemory(req);
          }
        }

        // Projects API endpoints
        if (url.pathname === "/api/projects" && req.method === "GET") {
          return handleGetProjects(req);
        }

        if (url.pathname === "/api/projects" && req.method === "POST") {
          return handleCreateProject(req);
        }

        // Match /api/projects/:id endpoints
        const projectIdMatch = url.pathname.match(/^\/api\/projects\/([^\/]+)$/);
        if (projectIdMatch) {
          const projectId = projectIdMatch[1];
          if (req.method === "GET") {
            return handleGetProject(req, projectId);
          } else if (req.method === "PUT") {
            return handleUpdateProject(req, projectId);
          } else if (req.method === "DELETE") {
            return handleDeleteProject(req, projectId);
          }
        }

        // Conversations API endpoints
        if (url.pathname === "/api/conversations" && req.method === "GET") {
          return handleGetConversations(req);
        }

        // Match /api/conversations/:convId/messages endpoints
        const convMessagesMatch = url.pathname.match(/^\/api\/conversations\/([^\/]+)\/messages$/);
        if (convMessagesMatch && req.method === "GET") {
          const convId = convMessagesMatch[1];
          return handleGetConversationMessages(req, convId);
        }

        // Match /api/conversations/:convId endpoints
        const convIdMatch = url.pathname.match(/^\/api\/conversations\/([^\/]+)$/);
        if (convIdMatch && req.method === "DELETE") {
          const convId = convIdMatch[1];
          return handleDeleteConversation(req, convId);
        }

        // Context API endpoints
        if (url.pathname === "/api/context/default") {
          if (req.method === "GET") {
            return handleGetDefaultContext(req);
          }
        }

        if (url.pathname === "/api/context") {
          if (req.method === "GET") {
            return handleGetContext(req);
          } else if (req.method === "PUT") {
            return handleUpdateContext(req);
          }
        }

        // Auth API endpoints
        // Registration is disabled - users must be created by admin
        // if (url.pathname === "/api/auth/register" && req.method === "POST") {
        //   return handleRegister(req);
        // }

        if (url.pathname === "/api/auth/login" && req.method === "POST") {
          return handleLogin(req);
        }

        if (url.pathname === "/api/auth/logout" && req.method === "POST") {
          return handleLogout(req);
        }

        if (url.pathname === "/api/auth/me" && req.method === "GET") {
          return handleGetCurrentUser(req);
        }

        if (url.pathname === "/api/auth/change-password" && req.method === "POST") {
          return handleChangePassword(req);
        }

        // Admin API endpoints
        if (url.pathname === "/api/admin/users" && req.method === "POST") {
          return handleAdminCreateUser(req);
        }

        if (url.pathname === "/api/admin/users" && req.method === "GET") {
          return handleAdminGetUsers(req);
        }

        // Match /api/admin/users/:userId endpoints
        const adminUserIdMatch = url.pathname.match(/^\/api\/admin\/users\/([^\/]+)$/);
        if (adminUserIdMatch && req.method === "DELETE") {
          const userId = adminUserIdMatch[1];
          return handleAdminDeleteUser(req, userId);
        }

        // Tenant API endpoints
        if (url.pathname === "/api/tenants" && req.method === "GET") {
          return handleGetTenants(req);
        }

        if (url.pathname === "/api/tenants" && req.method === "POST") {
          return handleCreateTenant(req);
        }

        // Match /api/tenants/:tenantId/users/:userId endpoints
        const tenantUserIdMatch = url.pathname.match(/^\/api\/tenants\/([^\/]+)\/users\/([^\/]+)$/);
        if (tenantUserIdMatch) {
          const tenantId = tenantUserIdMatch[1];
          const userId = tenantUserIdMatch[2];
          if (req.method === "PUT") {
            return handleUpdateTenantUser(req, tenantId, userId);
          } else if (req.method === "DELETE") {
            return handleDeleteTenantUser(req, tenantId, userId);
          }
        }

        // Match /api/tenants/:tenantId/users endpoints
        const tenantUsersMatch = url.pathname.match(/^\/api\/tenants\/([^\/]+)\/users$/);
        if (tenantUsersMatch) {
          const tenantId = tenantUsersMatch[1];
          if (req.method === "GET") {
            return handleGetTenantUsers(req, tenantId);
          } else if (req.method === "POST") {
            return handleCreateTenantUser(req, tenantId);
          }
        }

        // Match /api/tenants/:tenantId/logo endpoints
        const tenantLogoMatch = url.pathname.match(/^\/api\/tenants\/([^\/]+)\/logo$/);
        if (tenantLogoMatch) {
          const tenantId = tenantLogoMatch[1];
          if (req.method === "POST") {
            return handleUploadTenantLogo(req, tenantId);
          } else if (req.method === "GET") {
            return handleGetTenantLogo(req, tenantId);
          } else if (req.method === "DELETE") {
            return handleDeleteTenantLogo(req, tenantId);
          }
        }

        // Match /api/tenants/:tenantId endpoints
        const tenantIdMatch = url.pathname.match(/^\/api\/tenants\/([^\/]+)$/);
        if (tenantIdMatch) {
          const tenantId = tenantIdMatch[1];
          if (req.method === "GET") {
            return handleGetTenant(req, tenantId);
          } else if (req.method === "PUT") {
            return handleUpdateTenant(req, tenantId);
          } else if (req.method === "DELETE") {
            return handleDeleteTenant(req, tenantId);
          }
        }

        // Health check endpoint
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

        // Serve static files in production
        if (process.env.NODE_ENV === "production") {
          try {
            const staticPath = url.pathname === "/" ? "/index.html" : url.pathname;
            const filePath = `./frontend/dist${staticPath}`;
            const file = Bun.file(filePath);

            if (await file.exists()) {
              return new Response(file);
            }

            // Fallback to index.html for client-side routing (SPA)
            const indexFile = Bun.file("./frontend/dist/index.html");
            if (await indexFile.exists()) {
              return new Response(indexFile);
            }
          } catch (error) {
            console.error("Error serving static file:", error);
          }
        }

        // Development mode - show server info
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
                <p>WebSocket endpoint: <code>ws://${this.options.hostname}:${this.options.port}/api/ws</code></p>
                <p>Health check: <a href="/health">/health</a></p>
              </body>
            </html>
          `,
            {
              headers: { "Content-Type": "text/html" },
            }
          );
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
