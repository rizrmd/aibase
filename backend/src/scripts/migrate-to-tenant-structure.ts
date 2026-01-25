#!/usr/bin/env bun
/**
 * Migration script: Move project directories to tenant-based structure
 *
 * BEFORE: data/projects/{projectId}/
 * AFTER:  data/projects/{tenantId}/{projectId}/
 *
 * Usage:
 *   bun run backend/src/scripts/migrate-to-tenant-structure.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be done without making changes
 */

import { Database } from "bun:sqlite";
import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from '../config/paths';

interface MigrationResult {
  success: boolean;
  projectId: string;
  tenantId: number | string;
  oldPath: string;
  newPath: string;
  error?: string;
}

interface MigrationSummary {
  totalProjects: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: string[];
  results: MigrationResult[];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Tenant-Based Directory Structure Migration');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made\n');
  }

  const results: MigrationResult[] = [];
  const errors: string[] = [];
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // 1. Open projects database
    console.log('Opening projects database...');
    const dbPath = PATHS.PROJECTS_DB;
    const db = new Database(dbPath);

    // 2. Get all projects with their tenant_id
    console.log('Fetching projects from database...');
    const projects = db.query(`
      SELECT id, tenant_id
      FROM projects
      ORDER BY id
    `).all() as { id: string; tenant_id: number | null }[];

    db.close();

    if (projects.length === 0) {
      console.log('No projects found in database. Nothing to migrate.');
      return;
    }

    console.log(`Found ${projects.length} projects in database\n`);

    // 3. Process each project
    for (const project of projects) {
      const tenantId = project.tenant_id ?? 'default';
      const projectId = project.id;
      const oldPath = path.join(PATHS.PROJECTS_DIR, projectId);
      const newPath = path.join(PATHS.PROJECTS_DIR, String(tenantId), projectId);

      const result: MigrationResult = {
        success: false,
        projectId,
        tenantId,
        oldPath,
        newPath,
      };

      try {
        // Check if old project directory exists
        const oldExists = await fs.access(oldPath).then(() => true).catch(() => false);

        if (!oldExists) {
          result.success = true;
          result.error = 'Old directory does not exist (already migrated or never created)';
          skipped++;
          console.log(`  [SKIP] ${projectId} -> ${tenantId}/${projectId} (no old directory)`);
          results.push(result);
          continue;
        }

        // Check if new project directory already exists
        const newExists = await fs.access(newPath).then(() => true).catch(() => false);

        if (newExists) {
          result.success = false;
          result.error = 'New directory already exists - manual intervention required';
          failed++;
          errors.push(`${projectId}: Target directory already exists at ${newPath}`);
          console.error(`  [ERROR] ${projectId} -> ${tenantId}/${projectId} (target exists)`);
          results.push(result);
          continue;
        }

        if (dryRun) {
          result.success = true;
          migrated++;
          console.log(`  [DRY-RUN] Would move: ${projectId} -> ${tenantId}/${projectId}`);
          results.push(result);
          continue;
        }

        // Perform migration
        // 1. Create tenant directory if it doesn't exist
        const tenantDir = path.join(PATHS.PROJECTS_DIR, String(tenantId));
        await fs.mkdir(tenantDir, { recursive: true });

        // 2. Move project directory
        await fs.rename(oldPath, newPath);

        result.success = true;
        migrated++;
        console.log(`  [SUCCESS] ${projectId} -> ${tenantId}/${projectId}`);
        results.push(result);

      } catch (error: any) {
        result.success = false;
        result.error = error.message;
        failed++;
        errors.push(`${projectId}: ${error.message}`);
        console.error(`  [FAIL] ${projectId} -> ${tenantId}/${projectId}: ${error.message}`);
        results.push(result);
      }
    }

    // 4. Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total projects:   ${projects.length}`);
    console.log(`Migrated:         ${migrated}`);
    console.log(`Skipped:          ${skipped}`);
    console.log(`Failed:           ${failed}`);
    console.log('='.repeat(60));

    if (errors.length > 0) {
      console.log('\nErrors:');
      for (const error of errors) {
        console.log(`  - ${error}`);
      }
    }

    // 5. Ask for confirmation if not dry run
    if (!dryRun && failed === 0 && migrated > 0) {
      console.log('\nMigration completed successfully!');
      console.log('Please verify your data and restart the server.');
    } else if (!dryRun && failed > 0) {
      console.log('\nMigration completed with errors.');
      console.log('Please resolve the issues above and run the script again.');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\nFatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
main();
