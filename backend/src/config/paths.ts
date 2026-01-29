/**
 * Centralized path configuration for the data folder
 *
 * New organized structure:
 * data/
 * ├── app/               # Application-wide data
 * │   ├── databases/     # SQLite databases
 * │   ├── config/        # App configuration
 * │   └── assets/        # App-wide assets (logo, favicon)
 * ├── projects/         # User content (renamed from {projectId} pattern)
 * │   └── {projectId}/
 * │       ├── conversations/
 * │       │   └── {convId}/
 * │       │       ├── chats/
 * │       │       └── info.json
 * │       ├── files/
 * │       │   └── {convId}/
 * │       └── extensions/
 * │           └── {extensionId}/
 * ├── logs/             # All logs consolidated
 * │   ├── backend/
 * │   ├── whatsapp/
 * │   └── qdrant/
 * ├── services/         # Third-party service data
 * │   ├── qdrant/
 * │   └── whatsapp/
 * └── output/           # Temporary/script outputs
 *     └── storage/
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get the project root directory (3 levels up from backend/src/config/)
// paths.ts is in backend/src/config/, so we go: config -> src -> backend -> project root
const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(dirname(currentDir)));
const DATA_BASE = join(projectRoot, "data");

// Application data paths
export const PATHS = {
  // Base paths
  DATA_BASE,

  // Application-wide data
  APP_DIR: join(DATA_BASE, "app"),
  APP_DATABASES: join(DATA_BASE, "app", "databases"),
  APP_CONFIG: join(DATA_BASE, "app", "config"),
  APP_ASSETS: join(DATA_BASE, "app", "assets"),

  // Database files
  USERS_DB: join(DATA_BASE, "app", "databases", "users.db"),
  PROJECTS_DB: join(DATA_BASE, "app", "databases", "projects.db"),
  SETUP_CONFIG: join(DATA_BASE, "app", "config", "setup.json"),

  // App assets
  LOGO: join(DATA_BASE, "app", "assets", "logo.png"),
  FAVICON: join(DATA_BASE, "app", "assets", "favicon.png"),

  // User content
  PROJECTS_DIR: join(DATA_BASE, "projects"),

  // Logs
  LOGS_DIR: join(DATA_BASE, "logs"),
  BACKEND_LOGS: join(DATA_BASE, "logs", "backend"),
  WHATSAPP_LOGS: join(DATA_BASE, "logs", "whatsapp"),
  QDRANT_LOGS: join(DATA_BASE, "logs", "qdrant"),

  // Services data
  SERVICES_DIR: join(DATA_BASE, "services"),
  QDRANT_DIR: join(DATA_BASE, "services", "qdrant"),
  WHATSAPP_DIR: join(DATA_BASE, "services", "whatsapp"),

  // Script outputs
  OUTPUT_DIR: join(DATA_BASE, "output"),
  OUTPUT_STORAGE: join(DATA_BASE, "output", "storage"),

  // Runtime binaries (outside data/)
  // These are managed by bins/start/main.go
  // BUN_RUNTIME: "./runtime/bun"
  // QDRANT_RUNTIME: "./runtime/qdrant"
} as const;

/**
 * Get tenant directory path
 */
export function getTenantDir(tenantId: number | string): string {
  return join(PATHS.PROJECTS_DIR, String(tenantId));
}

/**
 * Get project directory path
 * @deprecated Use getProjectConversationDir instead
 */
export function getProjectDir(projectId: string, tenantId: number | string): string {
  return join(getTenantDir(tenantId), projectId);
}

/**
 * Get conversation directory path
 */
export function getConversationDir(projectId: string, convId: string, tenantId: number | string): string {
  return join(getProjectDir(projectId, tenantId), "conversations", convId);
}

/**
 * Get conversation chats directory
 */
export function getConversationChatsDir(projectId: string, convId: string, tenantId: number | string): string {
  return join(getConversationDir(projectId, convId, tenantId), "chats");
}

/**
 * Get project files directory (files are now stored at project level, organized by conversation)
 */
export function getProjectFilesDir(projectId: string, convId: string, tenantId: number | string): string {
  return join(getProjectDir(projectId, tenantId), "files", convId);
}

/**
 * Get project-level files directory (for files uploaded via file manager without conversation context)
 */
export function getProjectLevelFilesDir(projectId: string, tenantId: number | string): string {
  return join(getProjectDir(projectId, tenantId), "files", `project-files-${projectId}`);
}

/**
 * Get project extensions directory
 */
export function getProjectExtensionsDir(projectId: string, tenantId: number | string): string {
  return join(getProjectDir(projectId, tenantId), "extensions");
}

/**
 * Get extension directory
 */
export function getExtensionDir(projectId: string, extensionId: string, tenantId: number | string): string {
  return join(getProjectExtensionsDir(projectId, tenantId), extensionId);
}

/**
 * Ensure all required directories exist
 */
export async function ensureDirectories(): Promise<void> {
  const { mkdir } = await import("fs/promises");

  const dirs = [
    PATHS.APP_DATABASES,
    PATHS.APP_CONFIG,
    PATHS.APP_ASSETS,
    PATHS.PROJECTS_DIR,
    PATHS.LOGS_DIR,
    PATHS.BACKEND_LOGS,
    PATHS.WHATSAPP_LOGS,
    PATHS.QDRANT_LOGS,
    PATHS.SERVICES_DIR,
    PATHS.QDRANT_DIR,
    PATHS.WHATSAPP_DIR,
    PATHS.OUTPUT_DIR,
    PATHS.OUTPUT_STORAGE,
  ];

  for (const dir of dirs) {
    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      // Ignore error if directory already exists
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        throw err;
      }
    }
  }
}
