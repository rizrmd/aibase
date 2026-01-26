/**
 * Migrate existing embed_user_{uid} conversations to new structure
 * Old: data/{projectId}/embed_user_{uid}/
 * New: data/{projectId}/{uid}/embed_user_{uid}/
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Migrate existing embed_user_{uid} conversations to new structure
 */
export async function migrateEmbedConversations(): Promise<void> {
  // Skip migration if flag is set (useful for development with many projects)
  if (process.env.SKIP_MIGRATION === 'true') {
    console.log('[Migration] Skipping migration (SKIP_MIGRATION=true)');
    return;
  }

  const dataDir = path.join(process.cwd(), 'data');

  try {
    console.log('[Migration] Starting embed conversation migration...');

    // Check if data directory exists
    const dataDirExists = await fs.access(dataDir).then(() => true).catch(() => false);
    if (!dataDirExists) {
      console.log('[Migration] Data directory does not exist, skipping migration');
      return;
    }

    // Read all entries in data directory
    const dataDirEntries = await fs.readdir(dataDir, { withFileTypes: true });
    const projects = dataDirEntries.filter(d =>
      d.isDirectory() &&
      !d.name.endsWith('.db') && // Skip database files
      d.name !== 'backend' && // Skip backend logs
      d.name !== 'logs' // Skip log directories
    );

    if (projects.length === 0) {
      console.log('[Migration] No projects found, skipping migration');
      return;
    }

    console.log(`[Migration] Found ${projects.length} projects`);

    let totalMigrated = 0;

    for (const project of projects) {
      const projectId = project.name;
      const projectDir = path.join(dataDir, projectId);

      // Read all conversation directories in project
      const convDirs = await fs.readdir(projectDir, { withFileTypes: true }).catch(() => []);
      const embedConvDirs = convDirs.filter(d =>
        d.isDirectory() && d.name.startsWith('embed_user_')
      );

      if (embedConvDirs.length === 0) {
        console.log(`[Migration] No embed conversations found in project ${projectId}`);
        continue;
      }

      console.log(`[Migration] Found ${embedConvDirs.length} embed conversations in project ${projectId}`);

      for (const convDir of embedConvDirs) {
        const convId = convDir.name;
        const uid = convId.replace('embed_user_', '');

        const oldPath = path.join(projectDir, convId);
        const newPath = path.join(projectDir, uid, convId);

        try {
          // Check if old path exists
          const oldPathExists = await fs.access(oldPath).then(() => true).catch(() => false);
          if (!oldPathExists) {
            console.log(`[Migration] Old path does not exist: ${oldPath}, skipping`);
            continue;
          }

          // Check if new path already exists
          const newPathExists = await fs.access(newPath).then(() => true).catch(() => false);
          if (newPathExists) {
            console.log(`[Migration] New path already exists: ${newPath}, skipping`);
            // Remove old path to clean up
            await fs.rm(oldPath, { recursive: true, force: true });
            totalMigrated++;
            continue;
          }

          // Create new directory structure
          await fs.mkdir(path.dirname(newPath), { recursive: true });

          // Move conversation directory
          await fs.rename(oldPath, newPath);

          console.log(`[Migration] Migrated: ${projectId}/${convId} → ${projectId}/${uid}/${convId}`);
          totalMigrated++;
        } catch (error: any) {
          console.error(`[Migration] Error migrating ${projectId}/${convId}:`, error.message);
        }
      }
    }

    console.log(`[Migration] Completed successfully. Migrated ${totalMigrated} conversations`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('[Migration] Migration error:', error);
      throw error;
    }
  }
}

// Run if executed directly (e.g., `bun run migrate-embed-conversations.ts`)
if (import.meta.main) {
  migrateEmbedConversations()
    .then(() => {
      console.log('[Migration] Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Migration] Script failed:', error);
      process.exit(1);
    });
}
