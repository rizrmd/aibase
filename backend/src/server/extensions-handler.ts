import { ExtensionStorage } from "../storage/extension-storage";
import { ExtensionLoader } from "../tools/extensions/extension-loader";
import { authenticateRequest } from "./auth-handler";
import { ProjectStorage } from "../storage/project-storage";
import { createLogger } from "../utils/logger";
import {
  handleExtensionGeneratorRequest,
  handleExtensionPreviewRequest,
} from "./extension-generator-handler";

const logger = createLogger("Extensions");
const projectStorage = ProjectStorage.getInstance();
const extensionStorage = new ExtensionStorage();
const extensionLoader = new ExtensionLoader();

/**
 * Handle GET /api/projects/:projectId/extensions - Get all extensions for a project
 */
export async function handleGetExtensions(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Check if we should use default extensions or project-specific ones
    const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';

    // Get tenant ID for extension storage
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    let extensions;
    if (useDefaults) {
      // Development mode: Load from defaults with project override info
      const defaultExtensions = await extensionLoader['loadDefaults']();
      const projectExtensions = await extensionStorage.getAll(projectId, tenantId);

      // Create map of project extensions for fast lookup
      const projectMap = new Map(projectExtensions.map(p => [p.metadata.id, p]));

      // Transform to include source status
      extensions = defaultExtensions.map(ext => {
        const hasProjectVersion = projectMap.has(ext.metadata.id);
        return {
          ...ext,
          metadata: {
            ...ext.metadata,
            isDefault: !hasProjectVersion,
          },
          source: hasProjectVersion ? 'project' : 'default',
          hasProjectVersion,
          hasDefaultVersion: true,
        };
      });

      // Add project-only extensions
      const defaultIds = new Set(defaultExtensions.map(e => e.metadata.id));
      const projectOnly = projectExtensions
        .filter(p => !defaultIds.has(p.metadata.id))
        .map(ext => ({
          ...ext,
          metadata: {
            ...ext.metadata,
            isDefault: false,
          },
          source: 'project' as const,
          hasProjectVersion: true,
          hasDefaultVersion: false,
        }));

      extensions.push(...projectOnly);

      logger.info({ useDefaults, count: extensions.length, overriddenByProject: projectMap.size }, "Loaded extensions from defaults + project override");
    } else {
      // Production mode: Load from project extensions folder
      await extensionLoader.initializeProject(projectId);
      extensions = await extensionStorage.getAll(projectId, tenantId);

      // Add source status
      extensions = extensions.map(ext => ({
        ...ext,
        source: 'project' as const,
        hasProjectVersion: true,
        hasDefaultVersion: false,
      }));

      logger.info({ useDefaults, count: extensions.length }, "Loaded extensions from project folder");
    }

    return Response.json({
      success: true,
      data: { extensions },
    });
  } catch (error) {
    logger.error({ error }, "Error getting extensions");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get extensions",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/projects/:projectId/extensions/:extensionId - Get a specific extension
 */
export async function handleGetExtension(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Check if we should use default extensions or project-specific ones
    const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';

    // Get tenant ID for extension storage
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    let extension;
    if (useDefaults) {
      // Development mode: Load from defaults directory
      const defaultExtensions = await extensionLoader['loadDefaults']();
      extension = defaultExtensions.find(ext => ext.metadata.id === extensionId);
    } else {
      // Production mode: Load from project extensions folder
      extension = await extensionStorage.getById(projectId, extensionId, tenantId);
    }

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { extension },
    });
  } catch (error) {
    logger.error({ error }, "Error getting extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/projects/:projectId/extensions/:extensionId/health - Get extension health status
 *
 * Returns error status and health information for an extension.
 */
export async function handleGetExtensionHealth(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    // Get extension
    const extension = await extensionStorage.getById(projectId, extensionId, tenantId);

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    // Return health status
    return Response.json({
      success: true,
      data: {
        id: extension.metadata.id,
        name: extension.metadata.name,
        hasError: extension.metadata.hasError || false,
        errorCount: extension.metadata.errorCount || 0,
        lastError: extension.metadata.lastError,
        lastErrorAt: extension.metadata.lastErrorAt,
        enabled: extension.metadata.enabled,
        debug: extension.metadata.debug || false,
      }
    });
  } catch (error) {
    logger.error({ error, extensionId }, "Error getting extension health");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get extension health",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/projects/:projectId/extensions/:extensionId/debug - Get extension debug logs
 *
 * Returns debug logs for an extension (only if debug mode is enabled).
 */
export async function handleGetExtensionDebugLogs(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    // Get extension
    const extension = await extensionStorage.getById(projectId, extensionId, tenantId);

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    // Check if debug mode is enabled
    if (!extension.metadata.debug) {
      return Response.json(
        {
          success: false,
          error: "Debug mode is not enabled for this extension. Enable it by setting 'debug: true' in the extension metadata.",
        },
        { status: 400 }
      );
    }

    // Return debug logs
    return Response.json({
      success: true,
      data: {
        id: extension.metadata.id,
        name: extension.metadata.name,
        debugLogs: extension.metadata.debugLogs || [],
        hasError: extension.metadata.hasError || false,
        errorCount: extension.metadata.errorCount || 0,
        lastError: extension.metadata.lastError,
      }
    });
  } catch (error) {
    logger.error({ error, extensionId }, "Error getting extension debug logs");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get debug logs",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle PATCH /api/projects/:projectId/extensions/:extensionId/debug - Toggle debug mode
 *
 * Enable or disable debug mode for an extension.
 */
export async function handleToggleExtensionDebug(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const body = await req.json() as { debug?: unknown };
    const { debug } = body;

    if (typeof debug !== 'boolean') {
      return Response.json(
        { success: false, error: "Missing or invalid 'debug' field (must be boolean)" },
        { status: 400 }
      );
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    // Update extension
    const extension = await extensionStorage.update(projectId, extensionId, tenantId, {
      debug,
      // Clear logs when disabling debug mode
      debugLogs: debug ? undefined : [],
    });

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: {
        id: extension.metadata.id,
        name: extension.metadata.name,
        debug: extension.metadata.debug,
      },
    });
  } catch (error) {
    logger.error({ error, extensionId }, "Error toggling debug mode");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to toggle debug mode",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/extensions/:extensionId/logs - Add frontend log entry
 *
 * Receives log messages from frontend extension components and stores them.
 */
export async function handleAddExtensionLog(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const body = await req.json() as { level?: unknown; message?: unknown; data?: unknown };
    const { level, message, data } = body;

    if (!level || !message) {
      return Response.json(
        { success: false, error: "Missing 'level' or 'message' field" },
        { status: 400 }
      );
    }

    if (!['info', 'warn', 'error', 'debug'].includes(level as string)) {
      return Response.json(
        { success: false, error: "Invalid 'level' (must be info, warn, error, or debug)" },
        { status: 400 }
      );
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    // Add log entry with source='frontend'
    await extensionStorage.addDebugLog(
      projectId,
      extensionId,
      tenantId,
      level as 'info' | 'warn' | 'error' | 'debug',
      message as string,
      data,
      'frontend' // Mark as frontend log
    );

    return Response.json({ success: true });
  } catch (error) {
    logger.error({ error, extensionId }, "Error adding extension log");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add log",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/extensions/:extensionId/metadata - Get extension metadata
 *
 * Returns extension metadata including declared dependencies.
 * Supports project-specific overrides via query params.
 */
export async function handleGetExtensionMetadata(
  req: Request,
  extensionId: string
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const tenantId = url.searchParams.get('tenantId');

    // Check if we should use default extensions or project-specific ones
    const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';

    let extension;
    if (useDefaults || !projectId) {
      // Development mode or no project: Load from defaults directory
      const defaultExtensions = await extensionLoader['loadDefaults']();
      extension = defaultExtensions.find(ext => ext.metadata.id === extensionId);
    } else {
      // Production mode: Load from project extensions folder
      const tenant = tenantId || 'default';
      extension = await extensionStorage.getById(projectId, extensionId, tenant);
    }

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    // Return only metadata (not code)
    return Response.json({
      success: true,
      data: {
        id: extension.metadata.id,
        name: extension.metadata.name,
        description: extension.metadata.description,
        version: extension.metadata.version,
        author: extension.metadata.author,
        category: extension.metadata.category,
        enabled: extension.metadata.enabled,
        dependencies: extension.metadata.dependencies || null,
      }
    });
  } catch (error) {
    logger.error({ error, extensionId }, "Error getting extension metadata");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get extension metadata",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/extensions - Create a new extension
 */
export async function handleCreateExtension(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const body = await req.json() as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      author?: unknown;
      version?: unknown;
      category?: unknown;
      code?: unknown;
      enabled?: unknown;
    };
    const { id, name, description, author, version, category, code, enabled } = body;

    if (!id || !name || !description || !code) {
      return Response.json(
        { success: false, error: "Missing required fields: id, name, description, code" },
        { status: 400 }
      );
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const extension = await extensionStorage.create(projectId, tenantId, {
      id: id as string,
      name: name as string,
      description: description as string,
      author: author as string | undefined,
      version: version as string | undefined,
      category: (category as string | undefined) || '',
      code: code as string,
      enabled: enabled as boolean | undefined,
      isDefault: false,
    });

    return Response.json({
      success: true,
      data: { extension },
    });
  } catch (error) {
    logger.error({ error }, "Error creating extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle PUT /api/projects/:projectId/extensions/:extensionId - Update an extension
 */
export async function handleUpdateExtension(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const body = await req.json() as {
      name?: unknown;
      description?: unknown;
      author?: unknown;
      version?: unknown;
      code?: unknown;
      enabled?: unknown;
      category?: unknown;
    };
    const { name, description, author, version, code, enabled, category } = body;

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const extension = await extensionStorage.update(projectId, extensionId, tenantId, {
      name: name as string | undefined,
      description: description as string | undefined,
      author: author as string | undefined,
      version: version as string | undefined,
      code: code as string | undefined,
      enabled: enabled as boolean | undefined,
      category: category as string | undefined,
    });

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { extension },
    });
  } catch (error) {
    logger.error({ error }, "Error updating extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE /api/projects/:projectId/extensions/:extensionId - Delete an extension
 */
export async function handleDeleteExtension(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const deleted = await extensionStorage.delete(projectId, extensionId, tenantId);

    if (!deleted) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    logger.error({ error }, "Error deleting extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/extensions/:extensionId/toggle - Toggle extension enabled state
 */
export async function handleToggleExtension(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const extension = await extensionStorage.toggle(projectId, extensionId, tenantId);

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { extension },
    });
  } catch (error) {
    logger.error({ error }, "Error toggling extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to toggle extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/extensions/:extensionId/reload - Reload extension (clear caches)
 */
export async function handleReloadExtension(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get project to check tenant_id
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    // Check if extension exists
    const extensions = await extensionStorage.getAll(projectId, tenantId);
    const extension = extensions.find((e) => e.metadata.id === extensionId);

    if (!extension) {
      return Response.json(
        { success: false, error: "Extension not found" },
        { status: 404 }
      );
    }

    // Clear caches
    // 1. Delete disk cache files for both project-specific and global default
    const { clearExtensionCache } = await import('./extension-ui-handler');
    const cleared = await clearExtensionCache(extensionId, projectId, tenantId);

    // 2. Clear in-memory metadata cache is handled by the clearExtensionCache function

    return Response.json({
      success: true,
      message: `Extension "${extension.metadata.name}" cache cleared. ${cleared} cache file(s) deleted.`,
    });
  } catch (error) {
    logger.error({ error }, "Error reloading extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reload extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/extensions/reset - Reset to default extensions
 */
export async function handleResetExtensions(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    await extensionLoader.resetToDefaults(projectId);
    const extensions = await extensionStorage.getAll(projectId, tenantId);

    return Response.json({
      success: true,
      data: { extensions },
    });
  } catch (error) {
    logger.error({ error }, "Error resetting extensions");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reset extensions",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/extensions/generate - Generate extension using AI
 */
export async function handleGenerateExtension(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    return await handleExtensionGeneratorRequest(req, projectId);
  } catch (error) {
    logger.error({ error }, "Error generating extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/extensions/preview - Preview extension without saving
 */
export async function handlePreviewExtension(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    return await handleExtensionPreviewRequest(req);
  } catch (error) {
    logger.error({ error }, "Error previewing extension");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to preview extension",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/extensions/:extensionId/toggle-source - Toggle extension source
 *
 * Copies extension from default to project, or deletes project copy to use default
 */
export async function handleToggleExtensionSource(
  req: Request,
  projectId: string,
  extensionId: string
): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user has access to the project
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          { success: false, error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const body = await req.json() as { source?: unknown };
    const { source } = body;

    if (source !== 'default' && source !== 'project') {
      return Response.json(
        { success: false, error: "Invalid source. Must be 'default' or 'project'" },
        { status: 400 }
      );
    }

    // Get tenant ID
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';

    if (!useDefaults) {
      return Response.json(
        { success: false, error: "Source toggle is only available in development mode (USE_DEFAULT_EXTENSIONS=true)" },
        { status: 400 }
      );
    }

    // Get default extension
    const defaultExtensions = await extensionLoader['loadDefaults']();
    const defaultExt = defaultExtensions.find(e => e.metadata.id === extensionId);

    if (!defaultExt) {
      return Response.json(
        { success: false, error: "Extension not found in defaults" },
        { status: 404 }
      );
    }

    if ((source as string) === 'project') {
      // Copy default to project
      const existing = await extensionStorage.getById(projectId, extensionId, tenantId);

      if (existing) {
        return Response.json(
          { success: false, error: "Project version already exists", data: { currentSource: 'project' } },
          { status: 400 }
        );
      }

      // Create project copy
      await extensionStorage.create(projectId, tenantId, {
        id: defaultExt.metadata.id,
        name: defaultExt.metadata.name,
        description: defaultExt.metadata.description,
        author: defaultExt.metadata.author,
        version: defaultExt.metadata.version,
        category: defaultExt.metadata.category,
        code: defaultExt.code,
        enabled: defaultExt.metadata.enabled,
        isDefault: false,
      });

      logger.info({ extensionId, projectId }, "Copied extension from default to project");

      return Response.json({
        success: true,
        data: {
          extensionId,
          source: 'project',
          message: `Copied "${defaultExt.metadata.name}" to project. You can now customize it.`
        }
      });

    } else {
      // source === 'default': Delete project copy to use default
      const existing = await extensionStorage.getById(projectId, extensionId, tenantId);

      if (!existing) {
        return Response.json(
          { success: false, error: "No project version exists", data: { currentSource: 'default' } },
          { status: 400 }
        );
      }

      // Delete project copy
      await extensionStorage.delete(projectId, extensionId, tenantId);

      logger.info({ extensionId, projectId }, "Deleted project extension copy, using default");

      return Response.json({
        success: true,
        data: {
          extensionId,
          source: 'default',
          message: `Reset to default version. Customizations have been removed.`
        }
      });
    }

  } catch (error) {
    logger.error({ error, extensionId }, "Error toggling extension source");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to toggle extension source",
      },
      { status: 500 }
    );
  }
}
