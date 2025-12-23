/**
 * Embed API handlers
 * Manages project embedding functionality
 */

import { ProjectStorage } from "../storage/project-storage";
import { authenticateRequest } from "./auth-handler";

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
      },
    });
  } catch (error) {
    console.error("Error getting embed info:", error);
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
    console.error("Error enabling embed:", error);
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
    console.error("Error disabling embed:", error);
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
    console.error("Error regenerating embed token:", error);
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
    console.error("Error updating embed CSS:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update embed CSS",
      },
      { status: error instanceof Error && error.message.includes("owner") ? 403 : 500 }
    );
  }
}
