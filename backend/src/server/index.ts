/**
 * WebSocket Library for Bidirectional LLM Communication
 *
 * A modular TypeScript library for real-time bidirectional communication
 * between WebSocket clients and LLM conversation systems.
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

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
import { handleSaveImage } from "./image-save-handler";
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
  handleGetWhatsAppClient,
  handleCreateWhatsAppClient,
  handleDeleteWhatsAppClient,
  handleGetWhatsAppQRCode,
  handleWhatsAppWebhook,
  handleWhatsAppConnectionStatus,
  handleGetWhatsAppConversations,
  handleDeleteWhatsAppConversation,
  initWhatsAppNotifications,
} from "./whatsapp-handler";
import {
  handleGetExtensions,
  handleGetExtension,
  handleCreateExtension,
  handleUpdateExtension,
  handleDeleteExtension,
  handleToggleExtension,
  handleToggleExtensionSource,
  handleReloadExtension,
  handleResetExtensions,
  handleGenerateExtension,
  handlePreviewExtension,
} from "./extensions-handler";
import {
  handleGetCategories,
  handleGetCategory,
  handleCreateCategory,
  handleUpdateCategory,
  handleDeleteCategory,
} from "./categories-handler";
import {
  handleGetConversations,
  handleGetConversationMessages,
  handleCreateNewChat,
  handleDeleteConversation,
  handleRegenerateConversationTitle,
  handleGetEmbedUserConversations,
  handleDeleteEmbedConversation,
} from "./conversations-handler";
import {
  handleGetProjectFiles,
  handleGetConversationFiles,
  handleDeleteFile,
  handleRenameFile,
  handleMoveFile,
} from "./files-handler";
import { migrateEmbedConversations } from "../scripts/migrate-embed-conversations";
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleGetCurrentUser,
  handleChangePassword,
  handleAdminCreateUser,
  handleAdminGetUsers,
  handleAdminDeleteUser,
  handleAdminImpersonateUser,
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
import { handleChatCompletion } from "./llm-handler";
import {
  handleGetEmbedInfo,
  handleGetEmbedCss,
  handleUpdateEmbedCss,
  handleUpdateWelcomeMessage,
  handleGetEmbedStatus,
  handleRegenerateEmbedToken,
} from "./embed-handler";
import { handleEmbedAuth } from "./embed-auth-handler";
import {
  handleVerifyLicense,
  handleGetSetup,
  handleUpdateSetup,
  handleGetLogo,
  handleGetFavicon,
  handleGetPublicSetup,
  handleGetUsers,
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
  handleGetTenants as handleGetTenantsAdmin,
  handleCreateTenant as handleCreateTenantAdmin,
  handleUpdateTenant as handleUpdateTenantAdmin,
  handleDeleteTenant as handleDeleteTenantAdmin,
  handleCheckSetup,
} from "./setup-handler";
import { tenantCheckMiddleware } from "../middleware/tenant-check";
import { embedRateLimiter, embedWsRateLimiter, getClientIp } from "../middleware/rate-limiter";
import { ProjectStorage } from "../storage/project-storage";
import { TenantStorage } from "../storage/tenant-storage";
import { logger } from "../utils/logger";

/**
 * Normalize base path to ensure it starts with / and doesn't end with /
 */
function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === "/") return "";
  const normalized = basePath.trim();
  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }
  if (normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Get base path from environment variable
 */
function getBasePath(): string {
  const basePath = process.env.PUBLIC_BASE_PATH || "";
  return normalizeBasePath(basePath);
}

/**
 * Strip base path from pathname and return the relative path
 */
function stripBasePath(pathname: string): string {
  const basePath = getBasePath();
  if (!basePath) return pathname;
  if (pathname.startsWith(basePath)) {
    const relative = pathname.slice(basePath.length);
    return relative || "/";
  }
  return pathname;
}

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
    // Detect OS and set default port accordingly
    // Windows: 3678, Linux/Mac: 5040
    const isWindows = process.platform === 'win32';
    const defaultPort = isWindows ? 3678 : 5040;

    this.options = {
      port: defaultPort,
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
    // Ensure all required directories exist
    const { ensureDirectories } = await import("../config/paths");
    await ensureDirectories();

    // Pre-bundle extension UIs to warm up cache (async, don't wait)
    const { preBundleExtensionUIs } = await import("./extension-ui-handler");
    preBundleExtensionUIs().catch((error) => {
      console.error('[Server] Extension UI pre-bundling failed:', error);
    });

    // Run migration for embed conversations (async, don't wait)
    migrateEmbedConversations().catch((error) => {
      console.error('[Server] Migration failed:', error);
    });

    const wsHandlers = this.wsServer.getWebSocketHandlers();

    // Define WebSocket data type
    interface WebSocketData {
      convId?: string | null;
      projectId?: string | null;
      isEmbed?: boolean;
      token?: string | null;
      embedUid?: string | null;
      urlParams?: Record<string, string>;
      isWhatsAppWS?: boolean;
    }

    this.bunServer = Bun.serve<WebSocketData>({
      port: this.options.port,
      hostname: this.options.hostname,
      development: this.options.development,
      fetch: async (req, server) => {
        const url = new URL(req.url);
        const basePath = getBasePath();

        // Redirect root to base path if base path is set
        if (basePath && url.pathname === "/") {
          const host = req.headers.get("Host") || url.host;
          const protocol = url.protocol;
          return Response.redirect(`${protocol}//${host}${basePath}/`, 307);
        }

        // Strip base path from pathname for route matching
        // Also track if the original pathname started with the base path
        const pathname = stripBasePath(url.pathname);
        const hasBasePath = basePath === "" || url.pathname.startsWith(basePath);

        // Handle public embed WebSocket upgrade requests
        if (pathname.startsWith("/api/embed/ws")) {
          // Rate limit embed WebSocket connections
          const clientIp = getClientIp(req);
          if (!embedWsRateLimiter.checkLimit(clientIp, 10)) {
            return new Response("Rate limit exceeded", { status: 429 });
          }

          // Extract and validate embed parameters
          const embedToken = url.searchParams.get("embedToken");
          const projectId = url.searchParams.get("projectId");

          if (!embedToken || !projectId) {
            return new Response("Missing embedToken or projectId", { status: 400 });
          }

          // Verify project is embeddable and token matches
          const projectStorage = ProjectStorage.getInstance();
          const project = projectStorage.getById(projectId);

          if (!project || !project.is_embeddable || project.embed_token !== embedToken) {
            return new Response("Invalid embed configuration", { status: 403 });
          }

          // Use existing conversation ID from URL if provided, otherwise generate new one
          let convId = url.searchParams.get("convId");
          if (!convId) {
            convId = `embed_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          }

          // Extract session token if provided (for uid-based authentication)
          // When embed chat includes a uid parameter, the frontend calls /api/embed/auth
          // to create/retrieve an embed user (username: embed_{projectId}_{uid}) and
          // returns a session token. This token is then passed here as a query parameter
          // so we can authenticate the specific embed user.
          const sessionToken = url.searchParams.get("token");

          // Extract uid parameter to use as CURRENT_UID (the external user identifier)
          // This is the original uid value passed in the embed URL, not the database user ID
          const embedUid = url.searchParams.get("uid");

          // Extract ALL URL parameters for context replacement (excluding known system params)
          const urlParams: Record<string, string> = {};
          for (const [key, value] of url.searchParams.entries()) {
            // Skip known system parameters
            if (!['embedToken', 'projectId', 'convId', 'token', 'uid'].includes(key)) {
              urlParams[key] = value;
            }
          }

          // Upgrade to WebSocket with embed flag, session token, uid, and URL params
          const upgraded = server.upgrade(req, {
            data: { convId, projectId, isEmbed: true, token: sessionToken, embedUid, urlParams }
          });

          if (upgraded) {
            return undefined; // WebSocket connection established
          }
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Handle WebSocket upgrade requests
        if (pathname.startsWith("/api/ws")) {
          // Extract conversation ID and project ID from URL before upgrading
          const convId = url.searchParams.get("convId");
          const projectId = url.searchParams.get("projectId");

          // Extract ALL URL parameters for context replacement (excluding known system params)
          const urlParams: Record<string, string> = {};
          for (const [key, value] of url.searchParams.entries()) {
            // Skip known system parameters
            if (!['projectId', 'convId'].includes(key)) {
              urlParams[key] = value;
            }
          }

          // Pass conversation ID, project ID, and URL params as data to WebSocket connection
          const upgraded = server.upgrade(req, {
            data: { convId, projectId, urlParams }
          });
          if (upgraded) {
            return undefined; // WebSocket connection established
          }
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Handle file upload (POST /api/upload?convId=xxx)
        if (pathname === "/api/upload" && req.method === "POST") {
          return handleFileUpload(req, this.wsServer);
        }

        // Handle image save from base64 (POST /api/save-image?convId=xxx&projectId=xxx)
        if (pathname === "/api/save-image" && req.method === "POST") {
          return handleSaveImage(req);
        }

        // Handle file download (GET /api/files/{projectId}/{convId}/{fileName})
        if (pathname.startsWith("/api/files/") && req.method === "GET") {
          return handleFileDownload(req);
        }

        // Handle file deletion (DELETE /api/files/{projectId}/{convId}/{fileName})
        const fileDeleteMatch = pathname.match(/^\/api\/files\/([^\/]+)\/([^\/]+)\/([^\/]+)$/);
        if (fileDeleteMatch && req.method === "DELETE") {
          const [, projectId, convId, fileName] = fileDeleteMatch;
          return handleDeleteFile(req, projectId!, convId!, fileName!);
        }

        // Handle file rename (PATCH /api/files/{projectId}/{convId}/{fileName}/rename)
        const fileRenameMatch = pathname.match(/^\/api\/files\/([^\/]+)\/([^\/]+)\/([^\/]+)\/rename$/);
        if (fileRenameMatch && req.method === "PATCH") {
          const [, projectId, convId, fileName] = fileRenameMatch;
          return handleRenameFile(req, projectId!, convId!, fileName!);
        }

        // Handle file move (POST /api/files/move)
        if (pathname === "/api/files/move" && req.method === "POST") {
          return handleMoveFile(req);
        }

        // Get all files for a project (GET /api/files?projectId={id})
        if (pathname === "/api/files" && req.method === "GET") {
          return handleGetProjectFiles(req);
        }

        // Memory API endpoints
        if (pathname === "/api/memory") {
          if (req.method === "GET") {
            return handleGetMemory(req);
          } else if (req.method === "POST") {
            return handleSetMemory(req);
          } else if (req.method === "DELETE") {
            return handleDeleteMemory(req);
          }
        }

        // Projects API endpoints
        if (pathname === "/api/projects" && req.method === "GET") {
          return handleGetProjects(req);
        }

        if (pathname === "/api/projects" && req.method === "POST") {
          return handleCreateProject(req);
        }

        // Match /api/projects/:id endpoints
        const projectIdMatch = pathname.match(/^\/api\/projects\/([^\/]+)$/);
        if (projectIdMatch) {
          const projectId = projectIdMatch[1];
          if (req.method === "GET") {
            return handleGetProject(req, projectId!);
          } else if (req.method === "PUT") {
            return handleUpdateProject(req, projectId!);
          } else if (req.method === "DELETE") {
            return handleDeleteProject(req, projectId!);
          }
        }

        // Embed management API endpoints (authenticated)
        const embedRegenerateMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/embed\/regenerate$/);
        if (embedRegenerateMatch && req.method === "POST") {
          const projectId = embedRegenerateMatch[1];
          return handleRegenerateEmbedToken(req, projectId!);
        }


        const embedStatusMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/embed\/status$/);
        if (embedStatusMatch && req.method === "GET") {
          const projectId = embedStatusMatch[1];
          return handleGetEmbedStatus(req, projectId!);
        }

        const embedCssMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/embed\/css$/);
        if (embedCssMatch && req.method === "GET") {
          const projectId = embedCssMatch[1];
          return handleGetEmbedCss(req, projectId!);
        }
        if (embedCssMatch && req.method === "POST") {
          const projectId = embedCssMatch[1];
          return handleUpdateEmbedCss(req, projectId!);
        }

        const embedWelcomeMessageMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/embed\/welcome-message$/);
        if (embedWelcomeMessageMatch && req.method === "POST") {
          const projectId = embedWelcomeMessageMatch[1];
          return handleUpdateWelcomeMessage(req, projectId!);
        }

        // Extensions API endpoints
        const extensionsMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions$/);
        if (extensionsMatch) {
          const projectId = extensionsMatch[1];
          if (req.method === "GET") {
            return handleGetExtensions(req, projectId!);
          } else if (req.method === "POST") {
            return handleCreateExtension(req, projectId!);
          }
        }

        const extensionResetMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/reset$/);
        if (extensionResetMatch && req.method === "POST") {
          const projectId = extensionResetMatch[1];
          return handleResetExtensions(req, projectId!);
        }

        const extensionGenerateMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/generate$/);
        if (extensionGenerateMatch && req.method === "POST") {
          const projectId = extensionGenerateMatch[1];
          if (projectId) return handleGenerateExtension(req, projectId);
        }

        const extensionPreviewMatch = pathname.match(/^\/api\/extensions\/preview$/);
        if (extensionPreviewMatch && req.method === "POST") {
          return handlePreviewExtension(req);
        }

        const extensionIdMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/([^\/]+)$/);
        if (extensionIdMatch) {
          const projectId = extensionIdMatch[1];
          const extensionId = extensionIdMatch[2];
          if (req.method === "GET") {
            return handleGetExtension(req, projectId!, extensionId!);
          } else if (req.method === "PUT") {
            return handleUpdateExtension(req, projectId!, extensionId!);
          } else if (req.method === "DELETE") {
            return handleDeleteExtension(req, projectId!, extensionId!);
          }
        }

        const extensionToggleMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/([^\/]+)\/toggle$/);
        if (extensionToggleMatch && req.method === "POST") {
          const projectId = extensionToggleMatch[1];
          const extensionId = extensionToggleMatch[2];
          return handleToggleExtension(req, projectId!, extensionId!);
        }

        const extensionReloadMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/([^\/]+)\/reload$/);
        if (extensionReloadMatch && req.method === "POST") {
          const projectId = extensionReloadMatch[1];
          const extensionId = extensionReloadMatch[2];
          return handleReloadExtension(req, projectId!, extensionId!);
        }

        // Extension source toggle endpoint
        const extensionSourceToggleMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/([^\/]+)\/toggle-source$/);
        if (extensionSourceToggleMatch && req.method === "POST") {
          const projectId = extensionSourceToggleMatch[1];
          const extensionId = extensionSourceToggleMatch[2];
          return handleToggleExtensionSource(req, projectId!, extensionId!);
        }

        // Extension UI bundling endpoint
        const extensionUIMatch = pathname.match(/^\/api\/extensions\/([^\/]+)\/ui$/);
        if (extensionUIMatch && req.method === "GET") {
          const extensionId = extensionUIMatch[1];
          const { handleGetExtensionUI } = await import("./extension-ui-handler");
          return handleGetExtensionUI(req, extensionId!);
        }

        // Extension metadata endpoint
        const extensionMetadataMatch = pathname.match(/^\/api\/extensions\/([^\/]+)\/metadata$/);
        if (extensionMetadataMatch && req.method === "GET") {
          const extensionId = extensionMetadataMatch[1];
          const { handleGetExtensionMetadata } = await import("./extensions-handler");
          return handleGetExtensionMetadata(req, extensionId!);
        }

        // Extension dependency bundling endpoint
        if (pathname === "/api/extensions/dependencies/bundle" && req.method === "POST") {
          const { handleBundleDependencies } = await import("./extension-dependency-handler");
          return handleBundleDependencies(req);
        }

        // Extension dependency stats endpoint
        if (pathname === "/api/extensions/dependencies/stats" && req.method === "GET") {
          const { handleGetDependencyStats } = await import("./extension-dependency-handler");
          return handleGetDependencyStats();
        }

        // Extension dependency cache clear endpoint
        if (pathname === "/api/extensions/dependencies/cache" && req.method === "DELETE") {
          const { handleClearDependencyCache } = await import("./extension-dependency-handler");
          return handleClearDependencyCache(req);
        }

        // Extension health endpoint
        const extensionHealthMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/([^\/]+)\/health$/);
        if (extensionHealthMatch && req.method === "GET") {
          const projectId = extensionHealthMatch[1];
          const extensionId = extensionHealthMatch[2];
          if (projectId && extensionId) {
            const { handleGetExtensionHealth } = await import("./extensions-handler");
            return handleGetExtensionHealth(req, projectId, extensionId);
          }
        }

        // Extension debug logs endpoint
        const extensionDebugMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/([^\/]+)\/debug$/);
        if (extensionDebugMatch && req.method === "GET") {
          const projectId = extensionDebugMatch[1];
          const extensionId = extensionDebugMatch[2];
          if (projectId && extensionId) {
            const { handleGetExtensionDebugLogs } = await import("./extensions-handler");
            return handleGetExtensionDebugLogs(req, projectId, extensionId);
          }
        }

        // Extension debug toggle endpoint
        if (extensionDebugMatch && req.method === "PATCH") {
          const projectId = extensionDebugMatch[1];
          const extensionId = extensionDebugMatch[2];
          if (projectId && extensionId) {
            const { handleToggleExtensionDebug } = await import("./extensions-handler");
            return handleToggleExtensionDebug(req, projectId, extensionId);
          }
        }

        // Extension logs endpoint (frontend logging)
        const extensionLogsMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/extensions\/([^\/]+)\/logs$/);
        if (extensionLogsMatch && req.method === "POST") {
          const projectId = extensionLogsMatch[1];
          const extensionId = extensionLogsMatch[2];
          if (projectId && extensionId) {
            const { handleAddExtensionLog } = await import("./extensions-handler");
            return handleAddExtensionLog(req, projectId, extensionId);
          }
        }

        // Categories API endpoints
        const categoriesMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/categories$/);
        if (categoriesMatch) {
          const projectId = categoriesMatch[1];
          if (projectId) {
            if (req.method === "GET") {
              return handleGetCategories(req, projectId);
            } else if (req.method === "POST") {
              return handleCreateCategory(req, projectId);
            }
          }
        }

        const categoryIdMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/categories\/([^\/]+)$/);
        if (categoryIdMatch) {
          const projectId = categoryIdMatch[1];
          const categoryId = categoryIdMatch[2];
          if (projectId && categoryId) {
            if (req.method === "GET") {
              return handleGetCategory(req, projectId, categoryId);
            } else if (req.method === "PUT") {
              return handleUpdateCategory(req, projectId, categoryId);
            } else if (req.method === "DELETE") {
              return handleDeleteCategory(req, projectId, categoryId);
            }
          }
        }

        // WhatsApp endpoints (only enabled if AIMEOW=true)
        const aimeowEnabled = process.env.AIMEOW === "true";

        if (aimeowEnabled) {
          // WhatsApp WebSocket endpoint for real-time status updates
          if (pathname === "/api/whatsapp/ws") {
            const wsModule = await import("./whatsapp-ws");
            // Initialize notification functions so whatsapp-handler can use them
            // Initialize notification functions so whatsapp-handler can use them
            initWhatsAppNotifications(wsModule.notifyWhatsAppStatus, wsModule.notifyWhatsAppQRCode, wsModule.notifyWhatsAppQRTimeout);

            // Register WhatsApp handlers with the WebSocket server
            this.wsServer.registerWhatsAppHandlers(wsModule.getWhatsAppWebSocketHandlers());

            // Upgrade to WebSocket with WhatsApp flag
            const upgraded = server.upgrade(req, {
              data: { isWhatsAppWS: true }
            });

            if (upgraded) {
              return undefined; // WebSocket connection established
            }
            return new Response("WhatsApp WebSocket upgrade failed", { status: 400 });
          }

          // WhatsApp API endpoints
          if (pathname === "/api/whatsapp/client" && req.method === "GET") {
            return handleGetWhatsAppClient(req);
          }

          if (pathname === "/api/whatsapp/client" && req.method === "POST") {
            return handleCreateWhatsAppClient(req);
          }

          if (pathname === "/api/whatsapp/client" && req.method === "DELETE") {
            return handleDeleteWhatsAppClient(req);
          }

          if (pathname === "/api/whatsapp/qr" && req.method === "GET") {
            return handleGetWhatsAppQRCode(req);
          }

          if (pathname === "/api/whatsapp/webhook" && req.method === "POST") {
            return handleWhatsAppWebhook(req);
          }

          if (pathname === "/api/whatsapp/webhook/status" && req.method === "POST") {
            return handleWhatsAppConnectionStatus(req);
          }

          if (pathname === "/api/whatsapp/status" && req.method === "POST") {
            return handleWhatsAppConnectionStatus(req);
          }

          if (pathname === "/api/whatsapp/conversations" && req.method === "GET") {
            return handleGetWhatsAppConversations(req);
          }

          if (pathname === "/api/whatsapp/conversations/delete" && req.method === "DELETE") {
            return handleDeleteWhatsAppConversation(req);
          }
        }

        // Embed Authentication endpoint
        if (pathname === "/api/embed/auth" && req.method === "POST") {
          return handleEmbedAuth(req);
        }

        // Public embed info endpoint (no auth required)
        if (pathname === "/api/embed/info" && req.method === "GET") {
          // Rate limit embed info requests
          const clientIp = getClientIp(req);
          if (!embedRateLimiter.checkLimit(clientIp, 20)) {
            return Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
          }
          return handleGetEmbedInfo(req);
        }

        // Embed conversations endpoint (for listing user's conversations in embed mode)
        if (pathname === "/api/embed/conversations" && req.method === "GET") {
          return handleGetEmbedUserConversations(req);
        }

        // Match /api/embed/conversations/:convId endpoints (DELETE for embed mode)
        const embedConvIdMatch = pathname.match(/^\/api\/embed\/conversations\/([^\/]+)$/);
        if (embedConvIdMatch) {
          const convId = embedConvIdMatch[1];
          // Support both DELETE and POST with X-HTTP-Method-Override header
          // (for reverse proxies that don't forward DELETE methods)
          if (req.method === "DELETE" ||
            (req.method === "POST" && req.headers.get("X-HTTP-Method-Override") === "DELETE")) {
            return handleDeleteEmbedConversation(req, convId!);
          }
        }

        // LLM API endpoints
        if (pathname === "/api/llm/completion") {
          if (req.method === "OPTIONS") {
            return new Response(null, {
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
              },
            });
          }
          if (req.method === "POST") {
            return handleChatCompletion(req);
          }
        }

        // Conversations API endpoints
        if (pathname === "/api/conversations" && req.method === "POST") {
          return handleCreateNewChat(req);
        }

        if (pathname === "/api/conversations" && req.method === "GET") {
          return handleGetConversations(req);
        }

        // Match /api/conversations/:convId/messages endpoints
        const convMessagesMatch = pathname.match(/^\/api\/conversations\/([^\/]+)\/messages$/);
        if (convMessagesMatch && req.method === "GET") {
          const convId = convMessagesMatch[1];
          return handleGetConversationMessages(req, convId!);
        }

        // Match /api/conversations/:convId/files endpoints
        const convFilesMatch = pathname.match(/^\/api\/conversations\/([^\/]+)\/files$/);
        if (convFilesMatch && req.method === "GET") {
          const convId = convFilesMatch[1];
          return handleGetConversationFiles(req, convId!);
        }

        // Match /api/conversations/:convId/regenerate-title endpoints
        const convRegenerateTitleMatch = pathname.match(/^\/api\/conversations\/([^\/]+)\/regenerate-title$/);
        if (convRegenerateTitleMatch && req.method === "POST") {
          const convId = convRegenerateTitleMatch[1];
          return handleRegenerateConversationTitle(req, convId!);
        }

        // Match /api/conversations/:convId endpoints
        const convIdMatch = pathname.match(/^\/api\/conversations\/([^\/]+)$/);
        if (convIdMatch) {
          const convId = convIdMatch[1];
          // Support both DELETE and POST with X-HTTP-Method-Override header
          // (for reverse proxies that don't forward DELETE methods)
          if (req.method === "DELETE" ||
            (req.method === "POST" && req.headers.get("X-HTTP-Method-Override") === "DELETE")) {
            return handleDeleteConversation(req, convId!);
          }
        }

        // Context API endpoints
        if (pathname === "/api/context/default") {
          if (req.method === "GET") {
            return handleGetDefaultContext(req);
          }
        }

        if (pathname === "/api/context") {
          if (req.method === "GET") {
            return handleGetContext(req);
          } else if (req.method === "PUT") {
            return handleUpdateContext(req);
          }
        }

        // Auth API endpoints
        // Registration is disabled - users must be created by admin
        // if (pathname === "/api/auth/register" && req.method === "POST") {
        //   return handleRegister(req);
        // }

        if (pathname === "/api/auth/login" && req.method === "POST") {
          return handleLogin(req);
        }

        if (pathname === "/api/auth/logout" && req.method === "POST") {
          return handleLogout(req);
        }

        if (pathname === "/api/auth/me" && req.method === "GET") {
          return handleGetCurrentUser(req);
        }

        if (pathname === "/api/auth/change-password" && req.method === "POST") {
          return handleChangePassword(req);
        }

        // Admin API endpoints
        if (pathname === "/api/admin/users" && req.method === "POST") {
          return handleAdminCreateUser(req);
        }

        if (pathname === "/api/admin/users" && req.method === "GET") {
          return handleAdminGetUsers(req);
        }

        // Match /api/admin/users/:userId endpoints
        const adminUserIdMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)$/);
        if (adminUserIdMatch && req.method === "DELETE") {
          const userId = adminUserIdMatch[1];
          return handleAdminDeleteUser(req, userId!);
        }

        // Match /api/admin/users/:userId/impersonate endpoints
        const impersonateMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)\/impersonate$/);
        if (impersonateMatch && req.method === "POST") {
          const userId = impersonateMatch[1];
          return handleAdminImpersonateUser(req, userId!);
        }

        // Tenant API endpoints
        if (pathname === "/api/tenants" && req.method === "GET") {
          return handleGetTenants(req);
        }

        if (pathname === "/api/tenants" && req.method === "POST") {
          return handleCreateTenant(req);
        }

        // Match /api/tenants/:tenantId/users/:userId endpoints
        const tenantUserIdMatch = pathname.match(/^\/api\/tenants\/([^\/]+)\/users\/([^\/]+)$/);
        if (tenantUserIdMatch) {
          const tenantId = tenantUserIdMatch[1];
          const userId = tenantUserIdMatch[2];
          if (req.method === "PUT") {
            return handleUpdateTenantUser(req, tenantId!, userId!);
          } else if (req.method === "DELETE") {
            return handleDeleteTenantUser(req, tenantId!, userId!);
          }
        }

        // Match /api/tenants/:tenantId/users endpoints
        const tenantUsersMatch = pathname.match(/^\/api\/tenants\/([^\/]+)\/users$/);
        if (tenantUsersMatch) {
          const tenantId = tenantUsersMatch[1];
          if (req.method === "GET") {
            return handleGetTenantUsers(req, tenantId!);
          } else if (req.method === "POST") {
            return handleCreateTenantUser(req, tenantId!);
          }
        }

        // Match /api/tenants/:tenantId/logo endpoints
        const tenantLogoMatch = pathname.match(/^\/api\/tenants\/([^\/]+)\/logo$/);
        if (tenantLogoMatch) {
          const tenantId = tenantLogoMatch[1];
          if (req.method === "POST") {
            return handleUploadTenantLogo(req, tenantId!);
          } else if (req.method === "GET") {
            return handleGetTenantLogo(req, tenantId!);
          } else if (req.method === "DELETE") {
            return handleDeleteTenantLogo(req, tenantId!);
          }
        }

        // Match /api/tenants/:tenantId endpoints
        const tenantIdMatch = pathname.match(/^\/api\/tenants\/([^\/]+)$/);
        if (tenantIdMatch) {
          const tenantId = tenantIdMatch[1];
          if (req.method === "GET") {
            return handleGetTenant(req, tenantId!);
          } else if (req.method === "PUT") {
            return handleUpdateTenant(req, tenantId!);
          } else if (req.method === "DELETE") {
            return handleDeleteTenant(req, tenantId!);
          }
        }

        // Admin Setup API endpoints (no auth required, uses license key)
        if (pathname === "/api/setup" && req.method === "GET") {
          return handleGetPublicSetup(req);
        }

        if (pathname === "/api/setup/logo" && req.method === "GET") {
          return handleGetLogo(req);
        }

        if (pathname === "/api/setup/favicon" && req.method === "GET") {
          return handleGetFavicon(req);
        }

        if (pathname === "/api/setup/check" && req.method === "GET") {
          return handleCheckSetup(req);
        }

        if (pathname === "/api/admin/setup/verify-license" && req.method === "POST") {
          return handleVerifyLicense(req);
        }

        if (pathname === "/api/admin/setup" && req.method === "GET") {
          return handleGetSetup(req);
        }

        if (pathname === "/api/admin/setup" && req.method === "POST") {
          return handleUpdateSetup(req);
        }

        // Admin Setup User Management endpoints
        if (pathname === "/api/admin/setup/users" && req.method === "GET") {
          return handleGetUsers(req);
        }

        if (pathname === "/api/admin/setup/users" && req.method === "POST") {
          return handleCreateUser(req);
        }

        // Match /api/admin/setup/users/:userId endpoints
        const setupUserIdMatch = pathname.match(/^\/api\/admin\/setup\/users\/([^\/]+)$/);
        if (setupUserIdMatch) {
          const userId = setupUserIdMatch[1];
          if (req.method === "PUT") {
            return handleUpdateUser(req, userId!);
          } else if (req.method === "DELETE") {
            return handleDeleteUser(req, userId!);
          }
        }

        // Admin Setup Tenant Management endpoints
        if (pathname === "/api/admin/setup/tenants" && req.method === "GET") {
          return handleGetTenantsAdmin(req);
        }

        if (pathname === "/api/admin/setup/tenants" && req.method === "POST") {
          return handleCreateTenantAdmin(req);
        }

        // Match /api/admin/setup/tenants/:tenantId endpoints
        const setupTenantIdMatch = pathname.match(/^\/api\/admin\/setup\/tenants\/([^\/]+)$/);
        if (setupTenantIdMatch) {
          const tenantId = setupTenantIdMatch[1];
          if (req.method === "PUT") {
            return handleUpdateTenantAdmin(req, tenantId!);
          } else if (req.method === "DELETE") {
            return handleDeleteTenantAdmin(req, tenantId!);
          }
        }

        // Serve logo file
        if (pathname === "/api/admin/setup/logo" && req.method === "GET") {
          return handleGetLogo(req);
        }

        // Health check endpoint
        if (pathname === "/health") {
          return Response.json({
            status: "healthy",
            timestamp: Date.now(),
            connections: this.wsServer.getConnectionCount(),
            sessions: this.wsServer.getActiveSessions().length,
          });
        }

        // Handle custom routes
        for (const [path, handler] of Object.entries(this.options.routes)) {
          if (pathname === path) {
            return handler(req);
          }
        }

        // Serve static files in production
        // Only serve frontend content if the URL has the correct base path
        if (process.env.NODE_ENV === "production" && hasBasePath) {
          try {
            const staticPath = pathname === "/" ? "/index.html" : pathname;
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
            logger.error({ error }, "Error serving static file");
          }
        }

        // Development mode - show server info
        if (pathname === "/" && hasBasePath) {
          const wsPath = `${basePath}/api/ws`;
          const healthPath = `${basePath}/health`;
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
                <p>WebSocket endpoint: <code>ws://${this.options.hostname}:${this.options.port}${wsPath}</code></p>
                <p>Health check: <a href="${healthPath}">${healthPath}</a></p>
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

    logger.info(
      { port: this.options.port, hostname: this.options.hostname },
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
