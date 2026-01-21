/**
 * Tenant Setup Check Middleware
 *
 * Ensures that at least one tenant exists before allowing access to the application.
 * Redirects to admin-setup page when no tenants are configured.
 *
 * This middleware enforces the multi-tenant architecture by requiring
 * initial setup before normal app operations can proceed.
 */

import { TenantStorage } from "../storage/tenant-storage";

const tenantStorage = TenantStorage.getInstance();

// Paths that are allowed even when no tenants exist
const ALLOWED_PATHS = [
  "/admin-setup",
  "/api/admin/setup",
  "/api/health",
  "/api/setup",
];

// Public file extensions that should always be served
const PUBLIC_EXTENSIONS = [
  ".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg",
  ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot",
  ".map", ".txt", ".md"
];

/**
 * Check if a request path is allowed (bypasses tenant check)
 */
function isAllowedPath(pathname: string): boolean {
  // Check exact path matches
  if (ALLOWED_PATHS.some(allowed => pathname === allowed || pathname.startsWith(allowed + "/"))) {
    return true;
  }

  // Check for public file extensions (static assets)
  if (PUBLIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
    return true;
  }

  // Check for root path (should redirect to setup)
  if (pathname === "/" || pathname === "") {
    return false; // Will trigger setup redirect
  }

  return false;
}

/**
 * Get the current tenant count
 */
async function getTenantCount(): Promise<number> {
  try {
    await tenantStorage.initialize();
    const tenants = tenantStorage.getAll();
    return tenants.length;
  } catch (error) {
    console.error("[TenantCheck] Error getting tenant count:", error);
    return 0; // Assume no tenants on error to be safe
  }
}

/**
 * Middleware to check if tenant setup is required
 */
export async function requireTenantSetup(
  req: Request,
  next: () => Promise<Response>
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Check if this path is allowed even without tenants
  if (isAllowedPath(pathname)) {
    return next();
  }

  // Check if any tenants exist
  const tenantCount = await getTenantCount();

  if (tenantCount === 0) {
    // No tenants exist - block access and return setup required response
    return Response.json({
      success: false,
      needsSetup: true,
      redirect: "/admin-setup",
      error: "Application setup required. Please create at least one tenant."
    }, { status: 403 }); // 403 Forbidden
  }

  // Tenants exist - allow request to proceed
  return next();
}

/**
 * Express/Bun compatible middleware wrapper
 */
export function tenantCheckMiddleware(
  req: Request,
  next: () => Promise<Response>
): Promise<Response> {
  return requireTenantSetup(req, next);
}
