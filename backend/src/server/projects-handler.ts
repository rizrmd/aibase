import { ProjectStorage } from "../storage/project-storage";
import { authenticateRequest } from "./auth-handler";
import { createLogger } from "../utils/logger";

const logger = createLogger("Projects");
const projectStorage = ProjectStorage.getInstance();

// Initialize project storage
projectStorage.initialize().catch((error) => logger.error({ error }, "Failed to initialize project storage"));

/**
 * Handle GET /api/projects - Get all projects for the current user
 */
export async function handleGetProjects(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // All users (including root) only see their own projects + shared projects in their tenant
    const projects = projectStorage.getByUserId(auth.user.id, auth.user.tenant_id);

    return Response.json({
      success: true,
      data: { projects },
    });
  } catch (error) {
    logger.error({ error }, "Error getting projects");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get projects",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/projects/:id - Get a specific project
 */
export async function handleGetProject(req: Request, projectId: string): Promise<Response> {
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
        {
          success: false,
          error: "Project not found",
        },
        { status: 404 }
      );
    }

    // Check access permissions
    if (auth.user.role !== 'root') {
      const hasAccess = projectStorage.userHasAccess(projectId, auth.user.id, auth.user.tenant_id);
      if (!hasAccess) {
        return Response.json(
          {
            success: false,
            error: "Access denied",
          },
          { status: 403 }
        );
      }
    }

    return Response.json({
      success: true,
      data: { project },
    });
  } catch (error) {
    logger.error({ error }, "Error getting project");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get project",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects - Create a new project
 */
export async function handleCreateProject(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, description, is_shared } = body as any;

    if (!name || typeof name !== "string") {
      return Response.json(
        {
          success: false,
          error: "Project name is required and must be a string",
        },
        { status: 400 }
      );
    }

    if (name.trim().length === 0) {
      return Response.json(
        {
          success: false,
          error: "Project name cannot be empty",
        },
        { status: 400 }
      );
    }

    if (description !== undefined && typeof description !== "string") {
      return Response.json(
        {
          success: false,
          error: "Description must be a string",
        },
        { status: 400 }
      );
    }

    if (is_shared !== undefined && typeof is_shared !== "boolean") {
      return Response.json(
        {
          success: false,
          error: "is_shared must be a boolean",
        },
        { status: 400 }
      );
    }

    const project = await projectStorage.create({
      name: name.trim(),
      description: description?.trim(),
      user_id: auth.user.id,
      tenant_id: auth.user.tenant_id,
      is_shared: is_shared ?? false,
    });

    return Response.json(
      {
        success: true,
        data: { project },
        message: "Project created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ error }, "Error creating project");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create project",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle PUT /api/projects/:id - Update a project
 */
export async function handleUpdateProject(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, description, is_shared } = body as any;

    const updates: { name?: string; description?: string; is_shared?: boolean } = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return Response.json(
          {
            success: false,
            error: "Name must be a string",
          },
          { status: 400 }
        );
      }
      if (name.trim().length === 0) {
        return Response.json(
          {
            success: false,
            error: "Name cannot be empty",
          },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      if (typeof description !== "string") {
        return Response.json(
          {
            success: false,
            error: "Description must be a string",
          },
          { status: 400 }
        );
      }
      updates.description = description.trim();
    }

    if (is_shared !== undefined) {
      if (typeof is_shared !== "boolean") {
        return Response.json(
          {
            success: false,
            error: "is_shared must be a boolean",
          },
          { status: 400 }
        );
      }
      updates.is_shared = is_shared;
    }

    const project = await projectStorage.update(projectId, auth.user.id, updates);

    if (!project) {
      return Response.json(
        {
          success: false,
          error: "Project not found",
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { project },
      message: "Project updated successfully",
    });
  } catch (error) {
    logger.error({ error }, "Error updating project");

    // Handle permission errors
    if (error instanceof Error && error.message.includes('owner')) {
      return Response.json(
        {
          success: false,
          error: error.message,
        },
        { status: 403 }
      );
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update project",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE /api/projects/:id - Delete a project
 */
export async function handleDeleteProject(req: Request, projectId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const deleted = await projectStorage.delete(projectId, auth.user.id);

    if (!deleted) {
      return Response.json(
        {
          success: false,
          error: "Project not found",
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    logger.error({ error }, "Error deleting project");

    // Handle permission errors
    if (error instanceof Error && (error.message.includes('owner') || error.message.includes('default'))) {
      return Response.json(
        {
          success: false,
          error: error.message,
        },
        { status: 403 }
      );
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete project",
      },
      { status: 500 }
    );
  }
}
