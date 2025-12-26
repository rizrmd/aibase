/**
 * Tenant management API handlers
 */

import { TenantStorage } from "../storage/tenant-storage";
import { authenticateRequest } from "./auth-handler";
import { UserStorage } from "../storage/user-storage";
import * as fs from 'fs/promises';
import { createLogger } from "../utils/logger";

const logger = createLogger("Tenant");
const tenantStorage = TenantStorage.getInstance();
const userStorage = UserStorage.getInstance();

// Initialize tenant storage
tenantStorage.initialize().catch((error) => logger.error({ error }, "Failed to initialize tenant storage"));

/**
 * GET /api/tenants
 * Get all tenants (root only)
 */
export async function handleGetTenants(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can view all tenants
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenants = tenantStorage.getAll();
    return Response.json({ tenants });
  } catch (error: any) {
    logger.error({ error }, "Get tenants error");
    return Response.json(
      { error: error.message || "Failed to get tenants" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tenants/:tenantId
 * Get a specific tenant (root only, or admin of that tenant)
 */
export async function handleGetTenant(req: Request, tenantId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    // Root can view any tenant, admin can only view their own tenant
    if (auth.user.role === 'admin' && auth.user.tenant_id !== tenantIdNum) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    } else if (auth.user.role === 'user') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenant = tenantStorage.getById(tenantIdNum);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    return Response.json({ tenant });
  } catch (error: any) {
    logger.error({ error }, "Get tenant error");
    return Response.json(
      { error: error.message || "Failed to get tenant" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tenants
 * Create a new tenant (root only)
 */
export async function handleCreateTenant(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can create tenants
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();

    if (!body.name) {
      return Response.json(
        { error: "Tenant name is required" },
        { status: 400 }
      );
    }

    const tenant = await tenantStorage.create({
      name: body.name,
      domain: body.domain || null,
    });

    return Response.json({ tenant }, { status: 201 });
  } catch (error: any) {
    logger.error({ error }, "Create tenant error");
    return Response.json(
      { error: error.message || "Failed to create tenant" },
      { status: 400 }
    );
  }
}

/**
 * PUT /api/tenants/:tenantId
 * Update a tenant (root only)
 */
export async function handleUpdateTenant(req: Request, tenantId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can update tenants
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    const body = await req.json();

    const tenant = await tenantStorage.update(tenantIdNum, {
      name: body.name,
      domain: body.domain,
    });

    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    return Response.json({ tenant });
  } catch (error: any) {
    logger.error({ error }, "Update tenant error");
    return Response.json(
      { error: error.message || "Failed to update tenant" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/tenants/:tenantId
 * Delete a tenant (root only)
 */
export async function handleDeleteTenant(req: Request, tenantId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can delete tenants
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    const success = await tenantStorage.delete(tenantIdNum);

    if (!success) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, "Delete tenant error");
    return Response.json(
      { error: error.message || "Failed to delete tenant" },
      { status: 400 }
    );
  }
}

/**
 * POST /api/tenants/:tenantId/logo
 * Upload tenant logo (root only)
 */
export async function handleUploadTenantLogo(req: Request, tenantId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can upload logos
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    // Check if tenant exists
    const tenant = tenantStorage.getById(tenantIdNum);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get('logo') as File;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      return Response.json({ error: "Invalid file type. Only PNG and JPG are allowed" }, { status: 400 });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return Response.json({ error: "File too large. Maximum size is 5MB" }, { status: 400 });
    }

    // Ensure tenant directory exists
    await tenantStorage.ensureTenantDir(tenantIdNum);

    // Save file as logo.png
    const logoPath = tenantStorage.getTenantLogoPath(tenantIdNum);
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(logoPath, new Uint8Array(arrayBuffer));

    // Update tenant has_logo flag
    await tenantStorage.setHasLogo(tenantIdNum, true);

    logger.info({ tenantId: tenantIdNum }, "Logo uploaded");
    return Response.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, "Upload logo error");
    return Response.json(
      { error: error.message || "Failed to upload logo" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tenants/:tenantId/logo
 * Get tenant logo
 */
export async function handleGetTenantLogo(req: Request, tenantId: string): Promise<Response> {
  try {
    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    // Check if logo exists
    const logoExists = await tenantStorage.checkLogoExists(tenantIdNum);
    if (!logoExists) {
      return Response.json({ error: "Logo not found" }, { status: 404 });
    }

    // Read and serve the logo file
    const logoPath = tenantStorage.getTenantLogoPath(tenantIdNum);
    const file = Bun.file(logoPath);

    if (!(await file.exists())) {
      return Response.json({ error: "Logo not found" }, { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error: any) {
    logger.error({ error }, "Get logo error");
    return Response.json(
      { error: error.message || "Failed to get logo" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tenants/:tenantId/logo
 * Delete tenant logo (root only)
 */
export async function handleDeleteTenantLogo(req: Request, tenantId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can delete logos
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    // Check if tenant exists
    const tenant = tenantStorage.getById(tenantIdNum);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Delete logo
    await tenantStorage.deleteLogo(tenantIdNum);

    logger.info({ tenantId: tenantIdNum }, "Logo deleted");
    return Response.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, "Delete logo error");
    return Response.json(
      { error: error.message || "Failed to delete logo" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tenants/:tenantId/users
 * Get all users for a specific tenant (root only)
 */
export async function handleGetTenantUsers(req: Request, tenantId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can view tenant users
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    // Check if tenant exists
    const tenant = tenantStorage.getById(tenantIdNum);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    const users = userStorage.getByTenantId(tenantIdNum);
    return Response.json({ users });
  } catch (error: any) {
    logger.error({ error }, "Get tenant users error");
    return Response.json(
      { error: error.message || "Failed to get tenant users" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tenants/:tenantId/users
 * Create a new user for a specific tenant (root only)
 */
export async function handleCreateTenantUser(req: Request, tenantId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can create tenant users
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    if (isNaN(tenantIdNum)) {
      return Response.json({ error: "Invalid tenant ID" }, { status: 400 });
    }

    // Check if tenant exists
    const tenant = tenantStorage.getById(tenantIdNum);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    const body = await req.json();

    if (!body.email || !body.username || !body.password) {
      return Response.json(
        { error: "Email, username, and password are required" },
        { status: 400 }
      );
    }

    // Hash the password
    const password_hash = await Bun.password.hash(body.password);

    // Create user with tenant_id
    const user = await userStorage.create({
      email: body.email,
      username: body.username,
      password_hash,
      role: body.role || 'user',
      tenant_id: tenantIdNum,
    });

    // Remove password_hash from response
    const { password_hash: _, ...userWithoutPassword } = user;

    logger.info({ tenantId: tenantIdNum, username: user.username }, 'User created for tenant');
    return Response.json({ user: userWithoutPassword }, { status: 201 });
  } catch (error: any) {
    logger.error({ error }, "Create tenant user error");
    return Response.json(
      { error: error.message || "Failed to create user" },
      { status: 400 }
    );
  }
}

/**
 * PUT /api/tenants/:tenantId/users/:userId
 * Update a user in a specific tenant (root only)
 */
export async function handleUpdateTenantUser(req: Request, tenantId: string, userId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can update tenant users
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    const userIdNum = parseInt(userId, 10);

    if (isNaN(tenantIdNum) || isNaN(userIdNum)) {
      return Response.json({ error: "Invalid tenant or user ID" }, { status: 400 });
    }

    // Check if tenant exists
    const tenant = tenantStorage.getById(tenantIdNum);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Check if user exists and belongs to this tenant
    const existingUser = userStorage.getById(userIdNum);
    if (!existingUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (existingUser.tenant_id !== tenantIdNum) {
      return Response.json({ error: "User does not belong to this tenant" }, { status: 403 });
    }

    const body = await req.json();
    const updateData: any = {};

    if (body.email !== undefined) {
      updateData.email = body.email;
    }
    if (body.username !== undefined) {
      updateData.username = body.username;
    }
    if (body.password !== undefined) {
      updateData.password_hash = await Bun.password.hash(body.password);
    }
    if (body.role !== undefined) {
      // Validate role
      if (!['admin', 'user'].includes(body.role)) {
        return Response.json({ error: "Invalid role. Must be 'admin' or 'user'" }, { status: 400 });
      }
      updateData.role = body.role;
    }

    const user = await userStorage.update(userIdNum, updateData);

    if (!user) {
      return Response.json({ error: "Failed to update user" }, { status: 500 });
    }

    // Remove password_hash from response
    const { password_hash: _, ...userWithoutPassword } = user;

    logger.info({ tenantId: tenantIdNum, username: user.username }, 'User updated for tenant');
    return Response.json({ user: userWithoutPassword });
  } catch (error: any) {
    logger.error({ error }, "Update tenant user error");
    return Response.json(
      { error: error.message || "Failed to update user" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/tenants/:tenantId/users/:userId
 * Delete a user from a specific tenant (root only)
 */
export async function handleDeleteTenantUser(req: Request, tenantId: string, userId: string): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only root users can delete tenant users
    if (auth.user.role !== 'root') {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const tenantIdNum = parseInt(tenantId, 10);
    const userIdNum = parseInt(userId, 10);

    if (isNaN(tenantIdNum) || isNaN(userIdNum)) {
      return Response.json({ error: "Invalid tenant or user ID" }, { status: 400 });
    }

    // Check if tenant exists
    const tenant = tenantStorage.getById(tenantIdNum);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Check if user exists and belongs to this tenant
    const existingUser = userStorage.getById(userIdNum);
    if (!existingUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (existingUser.tenant_id !== tenantIdNum) {
      return Response.json({ error: "User does not belong to this tenant" }, { status: 403 });
    }

    const success = await userStorage.delete(userIdNum);

    if (!success) {
      return Response.json({ error: "Failed to delete user" }, { status: 500 });
    }

    logger.info({ tenantId: tenantIdNum }, 'User deleted from tenant');
    return Response.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, "Delete tenant user error");
    return Response.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
