/**
 * Authentication API handlers
 */

import { AuthService } from "../services/auth-service";
import { createLogger } from "../utils/logger";

const logger = createLogger("Auth");

const authService = AuthService.getInstance();

// Initialize auth service on module load
authService.initialize().catch((error) => logger.error({ error }, "Failed to initialize auth service"));

/**
 * Extract session token from Authorization header or cookie
 */
function extractToken(req: Request): string | null {
  // Try Authorization header first (Bearer token)
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Try cookie as fallback
  const cookieHeader = req.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    return cookies["session_token"] || null;
  }

  return null;
}

/**
 * POST /api/auth/register
 * Register a new user
 */
export async function handleRegister(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    if (!body.email || !body.username || !body.password) {
      return Response.json(
        { error: "Email, username, and password are required" },
        { status: 400 }
      );
    }

    const result = await authService.register({
      email: body.email,
      username: body.username,
      password: body.password,
    });

    // Set session token in cookie
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set(
      "Set-Cookie",
      `session_token=${result.session.token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`
    );

    return new Response(
      JSON.stringify({
        user: result.user,
        token: result.session.token,
      }),
      { status: 201, headers }
    );
  } catch (error: any) {
    logger.error({ error }, "Registration error");
    return Response.json(
      { error: error.message || "Registration failed" },
      { status: 400 }
    );
  }
}

/**
 * POST /api/auth/login
 * Login a user
 */
export async function handleLogin(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    if (!body.emailOrUsername || !body.password) {
      return Response.json(
        { error: "Email/username and password are required" },
        { status: 400 }
      );
    }

    const result = await authService.login({
      emailOrUsername: body.emailOrUsername,
      password: body.password,
    });

    // Set session token in cookie
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set(
      "Set-Cookie",
      `session_token=${result.session.token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`
    );

    return new Response(
      JSON.stringify({
        user: result.user,
        token: result.session.token,
      }),
      { status: 200, headers }
    );
  } catch (error: any) {
    logger.error({ error }, "Login error");
    return Response.json(
      { error: error.message || "Login failed" },
      { status: 401 }
    );
  }
}

/**
 * POST /api/auth/logout
 * Logout a user
 */
export async function handleLogout(req: Request): Promise<Response> {
  try {
    const token = extractToken(req);

    if (token) {
      await authService.logout(token);
    }

    // Clear session cookie
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set(
      "Set-Cookie",
      "session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict"
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  } catch (error: any) {
    logger.error({ error }, "Logout error");
    return Response.json(
      { error: error.message || "Logout failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/me
 * Get current user info
 */
export async function handleGetCurrentUser(req: Request): Promise<Response> {
  try {
    const token = extractToken(req);

    if (!token) {
      return Response.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const user = await authService.getUserByToken(token);

    if (!user) {
      return Response.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    return Response.json({ user });
  } catch (error: any) {
    logger.error({ error }, "Get current user error");
    return Response.json(
      { error: error.message || "Failed to get user" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/change-password
 * Change user password
 */
export async function handleChangePassword(req: Request): Promise<Response> {
  try {
    const token = extractToken(req);

    if (!token) {
      return Response.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const user = await authService.getUserByToken(token);
    if (!user) {
      return Response.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (!body.currentPassword || !body.newPassword) {
      return Response.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    await authService.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword
    );

    return Response.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, "Change password error");
    return Response.json(
      { error: error.message || "Failed to change password" },
      { status: 400 }
    );
  }
}

/**
 * POST /api/admin/users
 * Create a new user (admin/root only)
 */
export async function handleAdminCreateUser(req: Request): Promise<Response> {
  try {
    const token = extractToken(req);
    if (!token) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await authService.getUserByToken(token);
    if (!currentUser) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    // Check if user is admin or root
    if (!authService.hasRole(currentUser.id, 'admin')) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();

    if (!body.email || !body.username || !body.password) {
      return Response.json(
        { error: "Email, username, and password are required" },
        { status: 400 }
      );
    }

    const newUser = await authService.createUser(currentUser.id, {
      email: body.email,
      username: body.username,
      password: body.password,
      role: body.role || 'user',
      tenant_id: body.tenant_id,
    });

    return Response.json({ user: newUser }, { status: 201 });
  } catch (error: any) {
    logger.error({ error }, "Create user error");
    return Response.json(
      { error: error.message || "Failed to create user" },
      { status: 400 }
    );
  }
}

/**
 * GET /api/admin/users
 * Get all users (admin/root only)
 */
export async function handleAdminGetUsers(req: Request): Promise<Response> {
  try {
    const token = extractToken(req);
    if (!token) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await authService.getUserByToken(token);
    if (!currentUser) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    const users = await authService.getAllUsers(currentUser.id);
    return Response.json({ users });
  } catch (error: any) {
    logger.error({ error }, "Get users error");
    return Response.json(
      { error: error.message || "Failed to get users" },
      { status: 403 }
    );
  }
}

/**
 * DELETE /api/admin/users/:userId
 * Delete a user (admin/root only)
 */
export async function handleAdminDeleteUser(req: Request, userId: string): Promise<Response> {
  try {
    const token = extractToken(req);
    if (!token) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await authService.getUserByToken(token);
    if (!currentUser) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    // Check if user is admin or root
    if (!authService.hasRole(currentUser.id, 'admin')) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum)) {
      return Response.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // Prevent deleting yourself
    if (currentUser.id === userIdNum) {
      return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    // Delete the user through auth service (which will handle sessions cleanup)
    const success = await authService.deleteUserById(userIdNum);

    if (!success) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, "Delete user error");
    return Response.json(
      { error: error.message || "Failed to delete user" },
      { status: 400 }
    );
  }
}

/**
 * Middleware to protect routes that require authentication
 * Returns the authenticated user or null
 */
export async function authenticateRequest(req: Request): Promise<{ user: any; token: string } | null> {
  const token = extractToken(req);

  if (!token) {
    return null;
  }

  const user = await authService.getUserByToken(token);

  if (!user) {
    return null;
  }

  return { user, token };
}
