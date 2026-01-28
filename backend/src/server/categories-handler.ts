import { CategoryStorage } from "../storage/category-storage";
import { authenticateRequest } from "./auth-handler";
import { ProjectStorage } from "../storage/project-storage";
import { ExtensionStorage } from "../storage/extension-storage";
import { createLogger } from "../utils/logger";

const logger = createLogger("Categories");
const projectStorage = ProjectStorage.getInstance();
const categoryStorage = new CategoryStorage();
const extensionStorage = new ExtensionStorage();

/**
 * Handle GET /api/projects/:projectId/categories - Get all categories
 */
export async function handleGetCategories(req: Request, projectId: string): Promise<Response> {
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const categories = await categoryStorage.getAll(projectId, tenantId);

    return Response.json({
      success: true,
      data: { categories },
    });
  } catch (error) {
    logger.error({ error }, "Error getting categories");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get categories",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/projects/:projectId/categories/:categoryId - Get a specific category
 */
export async function handleGetCategory(
  req: Request,
  projectId: string,
  categoryId: string
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const category = await categoryStorage.getById(projectId, tenantId, categoryId);

    if (!category) {
      return Response.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { category },
    });
  } catch (error) {
    logger.error({ error }, "Error getting category");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get category",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/projects/:projectId/categories - Create a new category
 */
export async function handleCreateCategory(req: Request, projectId: string): Promise<Response> {
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const body = await req.json() as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      icon?: unknown;
      color?: unknown;
    };
    const { id, name, description, icon, color } = body;

    if (!id || !name) {
      return Response.json(
        { success: false, error: "Missing required fields: id, name" },
        { status: 400 }
      );
    }

    const category = await categoryStorage.create(projectId, tenantId, {
      id: id as string,
      name: name as string,
      description: description as string | undefined,
      icon: icon as string | undefined,
      color: color as string | undefined,
    });

    return Response.json({
      success: true,
      data: { category },
    });
  } catch (error) {
    logger.error({ error }, "Error creating category");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create category",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle PUT /api/projects/:projectId/categories/:categoryId - Update a category
 */
export async function handleUpdateCategory(
  req: Request,
  projectId: string,
  categoryId: string
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const body = await req.json() as {
      name?: unknown;
      description?: unknown;
      icon?: unknown;
      color?: unknown;
    };
    const { name, description, icon, color } = body;

    const category = await categoryStorage.update(projectId, tenantId, categoryId, {
      name: name as string | undefined,
      description: description as string | undefined,
      icon: icon as string | undefined,
      color: color as string | undefined,
    });

    if (!category) {
      return Response.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { category },
    });
  } catch (error) {
    logger.error({ error }, "Error updating category");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update category",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE /api/projects/:projectId/categories/:categoryId - Delete a category
 */
export async function handleDeleteCategory(
  req: Request,
  projectId: string,
  categoryId: string
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

    // Get tenantId from project
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? auth.user.tenant_id;

    const deleted = await categoryStorage.delete(projectId, tenantId, categoryId);

    if (!deleted) {
      return Response.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    // Uncategorized all extensions that were in this category
    await extensionStorage.uncategorizeByCategory(projectId, categoryId, tenantId);

    return Response.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    logger.error({ error }, "Error deleting category");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete category",
      },
      { status: 500 }
    );
  }
}
