/**
 * File storage service for handling uploaded files
 * Stores files in /data/[proj-id]/[conv-id]/files/
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export type FileScope = 'user' | 'public';

export interface StoredFile {
  name: string;
  size: number;
  type: string;
  path: string;
  uploadedAt: number;
  scope: FileScope;
}

export class FileStorage {
  private static instance: FileStorage;
  private baseDir: string;

  private constructor() {
    // Use absolute path from project root
    this.baseDir = path.join(process.cwd(), 'data');
  }

  static getInstance(): FileStorage {
    if (!FileStorage.instance) {
      FileStorage.instance = new FileStorage();
    }
    return FileStorage.instance;
  }

  /**
   * Get the directory path for a conversation
   */
  private getConvDir(convId: string, projectId: string): string {
    return path.join(this.baseDir, projectId, convId, 'files');
  }

  /**
   * Ensure conversation directory exists
   */
  private async ensureConvDir(convId: string, projectId: string): Promise<void> {
    const convDir = this.getConvDir(convId, projectId);
    await fs.mkdir(convDir, { recursive: true });
  }

  /**
   * Get metadata file path for a file
   */
  private getMetaFilePath(convId: string, fileName: string, projectId: string): string {
    const convDir = this.getConvDir(convId, projectId);
    return path.join(convDir, `.${fileName}.meta.md`);
  }

  /**
   * Save metadata for a file in frontmatter format
   */
  private async saveFileMeta(
    convId: string,
    fileName: string,
    projectId: string,
    meta: { scope: FileScope; uploadedAt?: number; size?: number; type?: string }
  ): Promise<void> {
    const metaPath = this.getMetaFilePath(convId, fileName, projectId);

    // Build frontmatter content
    const frontmatter = Object.entries(meta)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
      .join('\n');

    const content = `---
${frontmatter}
---
`;

    await fs.writeFile(metaPath, content, 'utf-8');
  }

  /**
   * Load metadata for a file from frontmatter format
   */
  private async loadFileMeta(
    convId: string,
    fileName: string,
    projectId: string
  ): Promise<{ scope: FileScope; uploadedAt?: number; size?: number; type?: string }> {
    const metaPath = this.getMetaFilePath(convId, fileName, projectId);

    try {
      const content = await fs.readFile(metaPath, 'utf-8');

      // Parse frontmatter between --- delimiters
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return { scope: 'user' };
      }

      const frontmatter = frontmatterMatch[1];
      const meta: any = {};

      // Parse YAML-style key: value pairs
      for (const line of frontmatter.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          let value = line.slice(colonIndex + 1).trim();

          // Remove quotes from string values
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          // Parse numbers and booleans
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (!isNaN(Number(value))) value = Number(value);

          meta[key] = value;
        }
      }

      return meta.scope ? meta : { scope: 'user', ...meta };
    } catch (error: any) {
      // Metadata file doesn't exist, assume default scope
      if (error.code === 'ENOENT') {
        return { scope: 'user' };
      }
      throw error;
    }
  }

  /**
   * Save a file to disk
   * @throws Error if a file with the same name already exists
   */
  async saveFile(
    convId: string,
    fileName: string,
    fileBuffer: Buffer,
    fileType: string,
    projectId: string,
    scope: FileScope = 'user'
  ): Promise<StoredFile> {
    await this.ensureConvDir(convId, projectId);

    // Sanitize filename to prevent directory traversal
    const sanitizedFileName = path.basename(fileName);

    const filePath = path.join(this.getConvDir(convId, projectId), sanitizedFileName);

    // Check if file already exists to prevent overwrites
    try {
      await fs.access(filePath);
      throw new Error(`File "${sanitizedFileName}" already exists. Please use a different filename.`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        // Re-throw if it's not a "file doesn't exist" error
        throw error;
      }
      // File doesn't exist, proceed with save
    }

    // Write buffer directly to disk
    await fs.writeFile(filePath, fileBuffer);

    // Get file stats
    const stats = await fs.stat(filePath);
    const uploadedAt = Date.now();

    // Save metadata
    await this.saveFileMeta(convId, sanitizedFileName, projectId, {
      scope,
      uploadedAt,
      size: stats.size,
      type: fileType
    });

    return {
      name: sanitizedFileName,
      size: stats.size,
      type: fileType,
      path: filePath,
      uploadedAt,
      scope,
    };
  }

  /**
   * List all files for a conversation, optionally filtered by scope
   */
  async listFiles(convId: string, projectId: string, scope?: FileScope): Promise<StoredFile[]> {
    const convDir = this.getConvDir(convId, projectId);

    try {
      const entries = await fs.readdir(convDir, { withFileTypes: true });
      const files: StoredFile[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          // Skip metadata files
          if (entry.name.startsWith('.')) {
            continue;
          }

          const filePath = path.join(convDir, entry.name);
          const stats = await fs.stat(filePath);

          // Load metadata for scope
          const meta = await this.loadFileMeta(convId, entry.name, projectId);

          // Filter by scope if specified
          if (scope && meta.scope !== scope) {
            continue;
          }

          files.push({
            name: entry.name,
            size: stats.size,
            type: '', // Type info not available from filesystem
            path: filePath,
            uploadedAt: stats.mtimeMs,
            scope: meta.scope,
          });
        }
      }

      return files;
    } catch (error: any) {
      // Directory doesn't exist or is empty
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific file
   */
  async getFile(convId: string, fileName: string, projectId: string): Promise<Buffer> {
    // Sanitize filename and decode URL-encoded characters (e.g., %20 -> space)
    const sanitizedFileName = path.basename(fileName);
    const decodedFileName = decodeURIComponent(sanitizedFileName);
    const filePath = path.join(this.getConvDir(convId, projectId), decodedFileName);

    return await fs.readFile(filePath);
  }

  /**
   * Delete a file
   */
  async deleteFile(convId: string, fileName: string, projectId: string): Promise<void> {
    // Sanitize filename and decode URL-encoded characters (e.g., %20 -> space)
    const sanitizedFileName = path.basename(fileName);
    const decodedFileName = decodeURIComponent(sanitizedFileName);
    const filePath = path.join(this.getConvDir(convId, projectId), decodedFileName);

    await fs.unlink(filePath);

    // Also delete metadata file if it exists
    const metaPath = this.getMetaFilePath(convId, decodedFileName, projectId);
    try {
      await fs.unlink(metaPath);
    } catch (error: any) {
      // Metadata file might not exist, ignore
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Delete all files for a conversation
   */
  async deleteAllFiles(convId: string, projectId: string): Promise<void> {
    const convDir = this.getConvDir(convId, projectId);

    try {
      await fs.rm(convDir, { recursive: true, force: true });
    } catch (error: any) {
      // Ignore if directory doesn't exist
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get total storage size for a conversation
   */
  async getStorageSize(convId: string, projectId: string): Promise<number> {
    const files = await this.listFiles(convId, projectId);
    return files.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Migrate all .meta.json files to .meta.md format for a project
   */
  async migrateMetadataFiles(projectId: string): Promise<{ migrated: number; errors: string[] }> {
    const projectDir = path.join(this.baseDir, projectId);
    const errors: string[] = [];
    const countRef = { count: 0 };

    try {
      // Recursively find all .meta.json files in the project
      await this.migrateDirectory(projectDir, errors, countRef);
    } catch (error: any) {
      errors.push(`Migration failed: ${error.message}`);
    }

    return { migrated: countRef.count, errors };
  }

  private async migrateDirectory(dirPath: string, errors: string[], countRef: { count: number }): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.migrateDirectory(fullPath, errors, countRef);
        } else if (entry.name.endsWith('.meta.json')) {
          // Migrate this metadata file
          try {
            await this.convertJsonToMd(fullPath);
            countRef.count++;
          } catch (error: any) {
            errors.push(`Failed to migrate ${entry.name}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      // Directory might not exist, skip it
      if (error.code !== 'ENOENT') {
        errors.push(`Failed to read directory ${dirPath}: ${error.message}`);
      }
    }
  }

  private async convertJsonToMd(jsonPath: string): Promise<void> {
    // Read JSON metadata
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const meta = JSON.parse(jsonContent);

    // Build frontmatter content
    const frontmatter = Object.entries(meta)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
      .join('\n');

    const mdContent = `---
${frontmatter}
---
`;

    // Write to .md file
    const mdPath = jsonPath.replace('.meta.json', '.meta.md');
    await fs.writeFile(mdPath, mdContent, 'utf-8');

    // Delete old JSON file
    await fs.unlink(jsonPath);
  }

  /**
   * Migrate all .meta.json files to .meta.md format for all projects
   */
  async migrateAllMetadata(): Promise<{ totalMigrated: number; projectResults: Record<string, { migrated: number; errors: string[] }> }> {
    const projectResults: Record<string, { migrated: number; errors: string[] }> = {};
    let totalMigrated = 0;

    try {
      const projects = await fs.readdir(this.baseDir, { withFileTypes: true });

      for (const project of projects) {
        if (project.isDirectory()) {
          const result = await this.migrateMetadataFiles(project.name);
          projectResults[project.name] = result;
          totalMigrated += result.migrated;
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    return { totalMigrated, projectResults };
  }
}
