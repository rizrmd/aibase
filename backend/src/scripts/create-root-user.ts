#!/usr/bin/env bun
/**
 * Create Root User Script
 *
 * Creates a default admin user for the AIBase application.
 * This is useful for initial setup or when you need to reset admin access.
 *
 * Usage:
 *   bun run backend/src/scripts/create-root-user.ts
 *
 * Default credentials:
 *   Username: admin
 *   Password: admin123
 *   Email: admin@aibase.local
 *
 * You can customize these values below or via environment variables.
 */

import { UserStorage } from "../storage/user-storage";
import { TenantStorage } from "../storage/tenant-storage";
import path from "path";

// Configuration - can be overridden via environment variables
const DEFAULT_ROOT_USER = {
  username: process.env.ROOT_USERNAME || "admin",
  password: process.env.ROOT_PASSWORD || "admin",
  email: process.env.ROOT_EMAIL || "admin@admin.com",
  tenant_name: process.env.ROOT_TENANT_NAME || "Default",
};

interface CreateResult {
  success: boolean;
  message: string;
  user?: {
    id: number;
    username: string;
    email: string;
    role: string;
  };
  tenant?: {
    id: number;
    name: string;
  };
}

/**
 * Create root user with default tenant
 */
async function createRootUser(): Promise<CreateResult> {
  try {
    console.log("🔐 AIBase Root User Creation");
    console.log("=".repeat(40));
    console.log("");

    // Initialize storage
    const userStorage = UserStorage.getInstance();
    const tenantStorage = TenantStorage.getInstance();

    await userStorage.initialize();
    await tenantStorage.initialize();

    // Check if root user already exists
    const existingUsers = await userStorage.getAll();
    const adminUser = existingUsers.find(
      (u) => u.username === DEFAULT_ROOT_USER.username
    );

    if (adminUser) {
      return {
        success: false,
        message: "Root user already exists!",
        user: {
          id: adminUser.id,
          username: adminUser.username,
          email: adminUser.email,
          role: adminUser.role,
        },
      };
    }

    // Get or create default tenant
    let tenant;
    const tenants = await tenantStorage.getAll();

    if (tenants.length === 0) {
      // Create default tenant
      const createdTenant = await tenantStorage.create({
        name: DEFAULT_ROOT_USER.tenant_name,
        slug: DEFAULT_ROOT_USER.tenant_name.toLowerCase().replace(/\s+/g, "-"),
        logo_url: null,
      });
      tenant = createdTenant;
      console.log(`✓ Created default tenant: ${tenant.name}`);
    } else {
      // Use first existing tenant
      const existingTenant = tenants[0];
      if (existingTenant) {
        tenant = existingTenant;
        console.log(`✓ Using existing tenant: ${tenant.name}`);
      }
    }

    if (!tenant) {
      return {
        success: false,
        message: "Failed to get or create tenant",
      };
    }

    // Hash password using Bun's built-in password hashing
    const passwordHash = await Bun.password.hash(DEFAULT_ROOT_USER.password, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Create root user
    const rootUser = await userStorage.create({
      username: DEFAULT_ROOT_USER.username,
      email: DEFAULT_ROOT_USER.email,
      password_hash: passwordHash,
      role: "admin",
      tenant_id: tenant.id,
    });

    console.log("");
    console.log("✅ Root user created successfully!");
    console.log("");
    console.log("Credentials:");
    console.log("  Username:", DEFAULT_ROOT_USER.username);
    console.log("  Password:", DEFAULT_ROOT_USER.password);
    console.log("  Email:", DEFAULT_ROOT_USER.email);
    console.log("  Role: admin");
    console.log("");
    console.log("⚠️  Please change the password after first login!");
    console.log("");

    return {
      success: true,
      message: "Root user created successfully",
      user: {
        id: rootUser.id,
        username: rootUser.username,
        email: rootUser.email,
        role: rootUser.role,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
    };
  } catch (error: any) {
    console.error("");
    console.error("❌ Error creating root user:", error.message);
    console.error("");

    return {
      success: false,
      message: error.message,
    };
  }
}

/**
 * Display usage information
 */
function displayUsage() {
  console.log("");
  console.log("Usage:");
  console.log("  bun run backend/src/scripts/create-root-user.ts");
  console.log("");
  console.log("Environment Variables (optional):");
  console.log("  ROOT_USERNAME     - Custom username (default: admin)");
  console.log("  ROOT_PASSWORD     - Custom password (default: admin123)");
  console.log(
    "  ROOT_EMAIL        - Custom email (default: admin@aibase.local)"
  );
  console.log("  ROOT_TENANT_NAME   - Custom tenant name (default: Default)");
  console.log("");
  console.log("Example with custom credentials:");
  console.log("  ROOT_USERNAME=myadmin ROOT_PASSWORD=secure123 \\");
  console.log("  bun run backend/src/scripts/create-root-user.ts");
  console.log("");
}

// Main execution
async function main() {
  // Change to project root directory
  const projectRoot = path.resolve(path.join(__dirname, "../../.."));

  // Check if user requested help
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    displayUsage();
    process.exit(0);
  }

  console.log(`Project root: ${projectRoot}`);
  console.log("");

  const result = await createRootUser();

  if (result.success) {
    process.exit(0);
  } else {
    if (result.user) {
      console.log("ℹ️  Existing user found:");
      console.log("  ID:", result.user.id);
      console.log("  Username:", result.user.username);
      console.log("  Email:", result.user.email);
      console.log("  Role:", result.user.role);
      console.log("");
    }
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
