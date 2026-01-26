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

    let extensions;
    if (useDefaults) {
      // Development mode: Load from defaults directory
      // Convert Extension format to match what UI expects
      const defaultExtensions = await extensionLoader['loadDefaults']();

      // Transform to include isDefault flag
      extensions = defaultExtensions.map(ext => ({
        ...ext,
        metadata: {
          ...ext.metadata,
          isDefault: true,
        },
      }));

      logger.info({ useDefaults, count: extensions.length }, "Loaded extensions from defaults directory");
    } else {
      // Production mode: Load from project extensions folder
      await extensionLoader.initializeProject(projectId);
      extensions = await extensionStorage.getAll(projectId);
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

    let extension;
    if (useDefaults) {
      // Development mode: Load from defaults directory
      const defaultExtensions = await extensionLoader['loadDefaults']();
      extension = defaultExtensions.find(ext => ext.metadata.id === extensionId);
    } else {
      // Production mode: Load from project extensions folder
      extension = await extensionStorage.getById(projectId, extensionId);
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

    const body = await req.json();
    const { id, name, description, author, version, category, code, enabled } = body;

    if (!id || !name || !description || !code) {
      return Response.json(
        { success: false, error: "Missing required fields: id, name, description, code" },
        { status: 400 }
      );
    }

    const extension = await extensionStorage.create(projectId, {
      id,
      name,
      description,
      author,
      version,
      category: category || '',
      code,
      enabled,
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

    const body = await req.json();
    const { name, description, author, version, code, enabled, category } = body;

    const extension = await extensionStorage.update(projectId, extensionId, {
      name,
      description,
      author,
      version,
      code,
      enabled,
      category,
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

    const deleted = await extensionStorage.delete(projectId, extensionId);

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

    const extension = await extensionStorage.toggle(projectId, extensionId);

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

    await extensionLoader.resetToDefaults(projectId);
    const extensions = await extensionStorage.getAll(projectId);

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

    return await handleExtensionGeneratorRequest(req, { projectId });
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
