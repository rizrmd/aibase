/**
 * Embed API handlers
 * Manages project embedding functionality
 */

import { ProjectStorage } from "../storage/project-storage";
import { authenticateRequest } from "./auth-handler";
import { createLogger } from "../utils/logger";

const logger = createLogger("Embed");

const projectStorage = ProjectStorage.getInstance();

/**
 * Handle GET /api/embed/info?projectId=xxx&embedToken=xxx
 * Public endpoint - returns basic project info for embed display
 */
export async function handleGetEmbedInfo(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const embedToken = url.searchParams.get("embedToken");

    if (!projectId || !embedToken) {
      return Response.json(
        { success: false, error: "Missing projectId or embedToken" },
        { status: 400 }
      );
    }

    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Verify embedding is enabled and token matches
    if (!project.is_embeddable || project.embed_token !== embedToken) {
      return Response.json(
        { success: false, error: "Invalid embed configuration" },
        { status: 403 }
      );
    }

    // Return only safe public info (no user_id, tenant_id, etc.)
    return Response.json({
      success: true,
      data: {
        projectId: project.id,
        name: project.name,
        description: project.description,
        customCss: project.custom_embed_css,
        welcomeMessage: project.welcome_message,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error getting embed info");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get embed info",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:id/embed/enable
 * Enable embedding for a project (authenticated)
 */
export async function handleEnableEmbed(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const embedToken = await projectStorage.enableEmbed(projectId, auth.user.id);

    return Response.json({
      success: true,
      data: { embedToken },
    });
  } catch (error) {
    logger.error({ error }, "Error enabling embed");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to enable embedding",
      },
      { status: error instanceof Error && error.message.includes("owner") ? 403 : 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:id/embed/disable
 * Disable embedding for a project (authenticated)
 */
export async function handleDisableEmbed(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    await projectStorage.disableEmbed(projectId, auth.user.id);

    return Response.json({
      success: true,
      data: { message: "Embedding disabled successfully" },
    });
  } catch (error) {
    logger.error({ error }, "Error disabling embed");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to disable embedding",
      },
      { status: error instanceof Error && error.message.includes("owner") ? 403 : 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:id/embed/regenerate
 * Regenerate embed token for a project (authenticated)
 */
export async function handleRegenerateEmbedToken(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const embedToken = await projectStorage.regenerateEmbedToken(projectId, auth.user.id);

    return Response.json({
      success: true,
      data: { embedToken },
    });
  } catch (error) {
    logger.error({ error }, "Error regenerating embed token");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to regenerate embed token",
      },
      { status: error instanceof Error && error.message.includes("owner") ? 403 : 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:id/embed/css
 * Update custom CSS for embedded chat (authenticated)
 */
export async function handleUpdateEmbedCss(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const customCss = body.customCss || "";

    // Limit CSS size to 10KB
    if (customCss.length > 10240) {
      return Response.json(
        { success: false, error: "Custom CSS exceeds 10KB limit" },
        { status: 400 }
      );
    }

    await projectStorage.updateEmbedCss(projectId, auth.user.id, customCss);

    return Response.json({
      success: true,
      data: { message: "Custom CSS updated successfully" },
    });
  } catch (error) {
    logger.error({ error }, "Error updating embed CSS");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update embed CSS",
      },
      { status: error instanceof Error && error.message.includes("owner") ? 403 : 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:id/embed/welcome-message
 * Update welcome message for embedded chat (authenticated)
 */
export async function handleUpdateWelcomeMessage(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const welcomeMessage = body.welcomeMessage || null;

    // Limit welcome message size to 500 characters
    if (welcomeMessage && welcomeMessage.length > 500) {
      return Response.json(
        { success: false, error: "Welcome message exceeds 500 character limit" },
        { status: 400 }
      );
    }

    await projectStorage.updateWelcomeMessage(projectId, auth.user.id, welcomeMessage);

    return Response.json({
      success: true,
      data: { message: "Welcome message updated successfully" },
    });
  } catch (error) {
    logger.error({ error }, "Error updating welcome message");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update welcome message",
      },
      { status: error instanceof Error && error.message.includes("owner") ? 403 : 500 }
    );
  }
}

/**
 * Handle GET /api/projects/:id/embed/status
 * Get embed status for a project (authenticated)
 */
export async function handleGetEmbedStatus(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: {
        isEmbeddable: project.is_embeddable,
        embedToken: project.embed_token,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error getting embed status");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get embed status",
      },
      { status: 500 }
    );
  }
}
