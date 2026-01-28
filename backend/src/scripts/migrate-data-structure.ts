#!/usr/bin/env bun
/**
 * Migration script to reorganize data folder structure
 *
 * OLD STRUCTURE:
 * data/
 * ├── projects.db
 * ├── users.db
 * ├── setup.json
 * ├── logo.png
 * ├── favicon.png
 * ├── backend/logs/
 * ├── bun/
 * ├── qdrant/
 * ├── whatsapp/
 * │   ├── data/
 * │   ├── files/
 * │   └── logs/
 * ├── {projectId}/
 * │   ├── {convId}/
 * │   │   ├── chats/
 * │   │   ├── files/
 * │   │   └── info.json
 * │   └── ext/
 * └── output-storage/
 *
 * NEW STRUCTURE:
 * data/
 * ├── app/
 * │   ├── databases/
 * │   │   ├── users.db
 * │   │   └── projects.db
 * │   ├── config/
 * │   │   └── setup.json
 * │   └── assets/
 * │       ├── logo.png
 * │       └── favicon.png
 * ├── projects/
 * │   └── {projectId}/
 * │       ├── conversations/
 * │       │   └── {convId}/
 * │       │       ├── chats/
 * │       │       ├── files/
 * │       │       └── info.json
 * │       └── extensions/
 * ├── logs/
 * │   ├── backend/
 * │   ├── whatsapp/
 * │   └── qdrant/
 * ├── services/
 * │   ├── qdrant/
 * │   │   ├── storage/
 * │   │   ├── logs/
 * │   │   └── config/
 * │   └── whatsapp/
 * │       ├── files/
 * │       └── (data managed by aimeow)
 * └── output/
 *     └── storage/
 *
 * runtime/ (outside data/)
 * ├── bun/
 * └── qdrant/
 */

import { readdir, stat, rename, mkdir, cp } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import * as fs from "fs/promises";

const DATA_DIR = "./data";

interface Migration {
  from: string;
  to: string;
  type: "file" | "dir";
  description: string;
}

const migrations: Migration[] = [
  // App databases
  { from: "users.db", to: "app/databases/users.db", type: "file", description: "Users database" },
  { from: "projects.db", to: "app/databases/projects.db", type: "file", description: "Projects database" },

  // App config
  { from: "setup.json", to: "app/config/setup.json", type: "file", description: "Setup configuration" },

  // App assets
  { from: "logo.png", to: "app/assets/logo.png", type: "file", description: "App logo" },
  { from: "favicon.png", to: "app/assets/favicon.png", type: "file", description: "App favicon" },

  // Logs reorganization
  { from: "backend/logs", to: "logs/backend", type: "dir", description: "Backend logs" },
  { from: "whatsapp/logs", to: "logs/whatsapp", type: "dir", description: "WhatsApp logs" },
  { from: "qdrant/logs", to: "logs/qdrant", type: "dir", description: "Qdrant logs" },

  // Services data
  { from: "qdrant/storage", to: "services/qdrant/storage", type: "dir", description: "Qdrant storage" },
  { from: "qdrant/config", to: "services/qdrant/config", type: "dir", description: "Qdrant config" },
  { from: "whatsapp/files", to: "services/whatsapp/files", type: "dir", description: "WhatsApp files" },
  { from: "whatsapp/data", to: "services/whatsapp/data", type: "dir", description: "WhatsApp data" },

  // Script outputs
  { from: "output-storage", to: "output/storage", type: "dir", description: "Script outputs" },
];

/**
 * Check if a path exists
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure parent directory exists
 */
async function ensureParentDir(targetPath: string): Promise<void> {
  const parts = targetPath.split("/");
  parts.pop(); // Remove filename/dirname
  const parentDir = parts.join("/");

  if (!(await pathExists(parentDir))) {
    await mkdir(parentDir, { recursive: true });
    console.log(`  Created directory: ${parentDir}`);
  }
}

/**
 * Migrate a file or directory
 */
async function migrateItem(migration: Migration): Promise<boolean> {
  const fromPath = join(DATA_DIR, migration.from);
  const toPath = join(DATA_DIR, migration.to);

  // Check if source exists
  if (!(await pathExists(fromPath))) {
    console.log(`⊘ ${migration.description}: Skipped (source not found)`);
    return false;
  }

  // Check if target already exists
  if (await pathExists(toPath)) {
    console.log(`⊘ ${migration.description}: Skipped (target already exists)`);
    return false;
  }

  try {
    // Ensure parent directory exists
    await ensureParentDir(toPath);

    // Perform migration
    await rename(fromPath, toPath);
    console.log(`✓ ${migration.description}: ${migration.from} → ${migration.to}`);
    return true;
  } catch (error) {
    console.error(`✗ ${migration.description}: Failed to migrate`, error);
    return false;
  }
}

/**
 * Migrate project folders
 * OLD: data/{projectId}/{convId}/*
 * NEW: data/projects/{projectId}/conversations/{convId}/*
 */
async function migrateProjectFolders(): Promise<number> {
  console.log("\n📁 Migrating project folders...");

  let migratedCount = 0;

  try {
    // List all directories in data/ (potential project folders)
    const entries = await readdir(DATA_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectId = entry.name;

      // Skip known system directories
      if (["app", "projects", "logs", "services", "output", "runtime", "backend", "bun", "qdrant", "whatsapp", "output-storage"].includes(projectId)) {
        continue;
      }

      const projectDir = join(DATA_DIR, projectId);

      // Check if this looks like a project folder (has subdirectories)
      const convEntries = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
      if (!convEntries || convEntries.length === 0) continue;

      // Check for ext/ folder
      const extDir = join(projectDir, "ext");
      if (await pathExists(extDir)) {
        const newExtDir = join(DATA_DIR, "projects", projectId, "extensions");
        await ensureParentDir(newExtDir);

        // Move ext/ to extensions/
        try {
          await rename(extDir, newExtDir);
          console.log(`✓ Extensions: ${projectId}/ext → projects/${projectId}/extensions`);
          migratedCount++;
        } catch (error) {
          console.error(`✗ Failed to migrate extensions for ${projectId}:`, error);
        }
      }

      // Migrate each conversation folder
      for (const convEntry of convEntries) {
        if (!convEntry.isDirectory()) continue;

        const convId = convEntry.name;

        // Skip ext/ (already handled above)
        if (convId === "ext") continue;

        const oldConvDir = join(projectDir, convId);
        const newConvDir = join(DATA_DIR, "projects", projectId, "conversations", convId);

        if (await pathExists(newConvDir)) {
          console.log(`⊘ Conversation ${projectId}/${convId}: Skipped (target exists)`);
          continue;
        }

        try {
          await ensureParentDir(newConvDir);
          await rename(oldConvDir, newConvDir);
          console.log(`✓ Conversation: ${projectId}/${convId} → projects/${projectId}/conversations/${convId}`);
          migratedCount++;
        } catch (error) {
          console.error(`✗ Failed to migrate conversation ${projectId}/${convId}:`, error);
        }
      }

      // Remove empty project folder
      try {
        const remaining = await readdir(projectDir);
        if (remaining.length === 0) {
          await fs.rm(projectDir, { recursive: true });
          console.log(`✓ Removed empty project folder: ${projectId}`);
        }
      } catch {
        // Ignore
      }
    }
  } catch (error) {
    console.error("✗ Error migrating project folders:", error);
  }

  return migratedCount;
}

/**
 * Create all required directories
 */
async function createDirectories(): Promise<void> {
  console.log("\n📂 Creating required directories...");

  const dirs = [
    "app/databases",
    "app/config",
    "app/assets",
    "projects",
    "logs/backend",
    "logs/whatsapp",
    "logs/qdrant",
    "services/qdrant",
    "services/whatsapp",
    "output/storage",
  ];

  for (const dir of dirs) {
    const dirPath = join(DATA_DIR, dir);
    if (!(await pathExists(dirPath))) {
      await mkdir(dirPath, { recursive: true });
      console.log(`  Created: ${dir}`);
    }
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log("🔄 Data Folder Structure Migration\n");
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Data directory: ${DATA_DIR}\n`);

  // Check if data directory exists
  if (!(await pathExists(DATA_DIR))) {
    console.log("✗ Data directory not found. Nothing to migrate.");
    process.exit(1);
  }

  // Step 1: Create new directory structure
  await createDirectories();

  // Step 2: Migrate system files and folders
  console.log("\n📦 Migrating system files...");
  let systemMigrated = 0;
  for (const migration of migrations) {
    const success = await migrateItem(migration);
    if (success) systemMigrated++;
  }

  // Step 3: Migrate project folders
  const projectMigrated = await migrateProjectFolders();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ Migration completed!");
  console.log(`   System files/directories migrated: ${systemMigrated}`);
  console.log(`   Project items migrated: ${projectMigrated}`);
  console.log("\n⚠️  IMPORTANT NOTES:");
  console.log("   1. Runtime binaries (bun/, qdrant/) moved to runtime/");
  console.log("   2. Old empty folders may remain - clean up manually if needed");
  console.log("   3. Test the application before deleting old data");
  console.log("   4. Backend will use new paths automatically");
  console.log("=".repeat(50));
}

// Run migration
main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
