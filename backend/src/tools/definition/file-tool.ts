import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";
import { extractTextFromFile, isDocxFile, isPdfFile, isExcelFile, isPowerPointFile } from "../../utils/document-extractor";
import { getConversationFilesDir } from "../../config/paths";

type FileScope = 'user' | 'public';

interface FileMeta {
  scope: FileScope;
}

/**
 * Context for the File tool
 */
export const context = async () => {
  return `## FILE TOOL - Manage files in conversation

All file paths are relative to the conversation's files directory.

**IMPORTANT:** The file tool returns JSON strings. Always parse with \`JSON.parse()\` in scripts!
- ✓ CORRECT: \`const result = JSON.parse(await file({ action: 'read', path: 'x.txt' }));\`
- ✗ WRONG: \`const result = await file({ action: 'read', path: 'x.txt' });\` (result is string, not object!)

**Available actions:** list, search, recent, exists, info, delete, rename, uploadUrl, write, read, peek

**File Scopes:**
- user: Only visible to the user who uploaded (default)
- public: Visible to all users in the conversation

**Supported File Types:**
- Plain text files (.txt, .md, .json, .csv, etc.)
- Word documents (.docx) - text is automatically extracted
- PDF documents (.pdf) - text is automatically extracted using unpdf
- Excel spreadsheets (.xlsx, .xls) - text is automatically extracted from all sheets
- PowerPoint presentations (.pptx, .ppt) - text is automatically extracted from all slides
- Other binary formats may not be readable

### Examples:
\`\`\`typescript
// ===== FAST DISCOVERY ACTIONS (Use these first!) =====

// Search files by pattern (supports wildcards: *, ?)
// Example: find all PDFs
const pdfs = JSON.parse(await file({ action: 'search', pattern: '*.pdf' }));
console.log(pdfs.files); // Array of matching files

// Find files starting with "report"
const reports = JSON.parse(await file({ action: 'search', pattern: 'report*' }));

// Find files with "data" in the name
const dataFiles = JSON.parse(await file({ action: 'search', pattern: '*data*' }));

// Get recently modified files (default: last 24 hours, max 20 files)
const recent = JSON.parse(await file({ action: 'recent' }));

// Get files from last 7 days
const lastWeek = JSON.parse(await file({ action: 'recent', timeRange: '7d', limit: 50 }));

// Get files from last hour
const lastHour = JSON.parse(await file({ action: 'recent', timeRange: '1h' }));

// Check if a specific file exists (faster than reading)
const exists = JSON.parse(await file({ action: 'exists', path: 'document.pdf' }));
if (exists.exists) {
  console.log('File found:', exists.sizeHuman);
}

// ===== COMPREHENSIVE ACTIONS =====

// List all files in current conversation
// Returns: { baseDirectory, totalFiles, scope, files: [...] }
const result = await file({ action: 'list' });
const files = JSON.parse(result).files; // Extract the files array

// List only public files
await file({ action: 'list', scope: 'public' });

// Get detailed file information
await file({ action: 'info', path: 'document.pdf' });

// ===== FILE MODIFICATION =====

// Delete a file
await file({ action: 'delete', path: 'old-file.txt' });

// Rename/move a file
await file({ action: 'rename', path: 'old-name.txt', newPath: 'new-name.txt' });

// Upload file from URL
await file({ action: 'uploadUrl', url: 'https://example.com/file.pdf', path: 'downloaded.pdf' });

// Write content to a file (creates new or overwrites existing)
await file({ action: 'write', path: 'output.txt', content: 'Hello World' });

// ===== FILE READING =====

// Read file content (returns up to ~8000 characters, roughly 2000 tokens)
// For .docx files, text is automatically extracted
await file({ action: 'read', path: 'data.json' });
await file({ action: 'read', path: 'document.docx' });

// Peek at file with offset and limit (for paginated reading)
await file({ action: 'peek', path: 'large-file.log', offset: 0, limit: 100 });

// ===== TYPICAL WORKFLOW =====

// 1. First, use 'search' to find the file you need
const files = JSON.parse(await file({ action: 'search', pattern: '*.pdf' })).files;

// 2. Use 'exists' to verify file is accessible
if (files.length > 0) {
  const exists = JSON.parse(await file({ action: 'exists', path: files[0].name }));
  if (exists.exists) {
    // 3. Read the file content
    const content = JSON.parse(await file({ action: 'read', path: files[0].name }));
    console.log(content.content);
  }
}
\`\`\``;
};

/**
 * File Tool - Built-in file operations
 * Actions: list, search, recent, exists, info, delete, rename, uploadUrl, write, read, peek
 * All operations are restricted to data/projects/{proj-id}/conversations/{conv-id}/files/ pattern
 */
export class FileTool extends Tool {
  name = "file";
  description = "Perform file operations: list files, search by name pattern, get recent files, check if file exists, get file info, delete file, rename/move file, upload file from URL, write content to file, read file content (max 8000 chars ~2000 tokens), or peek at file with pagination. All paths are relative to the project directory (data/projects/{proj-id}/) and must be within conversations/{conv-id}/files/ subdirectories.";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "search", "recent", "exists", "info", "delete", "rename", "uploadUrl", "write", "read", "peek"],
        description: "The action to perform",
      },
      path: {
        type: "string",
        description: "File or directory path relative to project directory (must be within {conv-id}/files/ subdirectories). For list/search/recent actions, defaults to current conversation. For uploadUrl/write/read/peek/exists/info, this is the filename.",
      },
      pattern: {
        type: "string",
        description: "Search pattern for filename matching (supports wildcards: *, ?). Required only for search action. Example: '*.pdf' finds all PDFs, 'report*' finds files starting with 'report'.",
      },
      limit: {
        type: "number",
        description: "Maximum number of files to return for search/recent action (default: 20). Maximum characters to return for peek action (default: 1000).",
      },
      timeRange: {
        type: "string",
        enum: ["1h", "24h", "7d", "30d", "all"],
        description: "Time filter for recent action (default: 24h). Options: 1h (last hour), 24h (last 24 hours), 7d (last 7 days), 30d (last 30 days), all (no filter).",
      },
      newPath: {
        type: "string",
        description: "New path for rename action (required only for rename)",
      },
      url: {
        type: "string",
        description: "URL to download file from (required only for uploadUrl action)",
      },
      content: {
        type: "string",
        description: "Content to write to file (required for write action)",
      },
      offset: {
        type: "number",
        description: "Starting character position for peek action (default: 0)",
      },
      scope: {
        type: "string",
        enum: ["user", "public"],
        description: "Filter files by scope (optional, applies to list/search/recent actions). If not specified, returns all files regardless of scope.",
      },
    },
    required: ["action"],
  };

  private convId: string = "default";
  private projectId: string = "A1";

  // File list cache: Map<convId, { files: string, timestamp: number }>
  private static fileCache = new Map<string, { files: string; timestamp: number }>();
  private static CACHE_TTL = 5000; // 5 seconds cache TTL

  /**
   * Set the conversation ID for this tool instance
   */
  setConvId(convId: string): void {
    this.convId = convId;
  }

  /**
   * Set the project ID for this tool instance
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * Get cache key for current conversation
   */
  private getCacheKey(): string {
    return `${this.projectId}:${this.convId}`;
  }

  /**
   * Get cached file list if still valid
   */
  private getCachedList(scope?: FileScope): string | null {
    const key = this.getCacheKey();
    const cached = FileTool.fileCache.get(key);

    if (cached && Date.now() - cached.timestamp < FileTool.CACHE_TTL) {
      // Parse and filter by scope if needed
      if (scope) {
        const data = JSON.parse(cached.files);
        data.files = data.files.filter((f: any) => f.scope === scope);
        data.scope = scope;
        data.totalFiles = data.files.length;
        return JSON.stringify(data, null, 2);
      }
      return cached.files;
    }

    return null;
  }

  /**
   * Set cached file list
   */
  private setCachedList(files: string): void {
    const key = this.getCacheKey();
    FileTool.fileCache.set(key, {
      files,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate cache for current conversation
   */
  private invalidateCache(): void {
    const key = this.getCacheKey();
    FileTool.fileCache.delete(key);
  }

  /**
   * Get the base directory for file operations
   * Returns: data/projects/{projectId}/
   */
  private getBaseDir(): string {
    return path.join(process.cwd(), "data", "projects", this.projectId);
  }

  /**
   * Get the conversation files directory
   * Returns: data/projects/{projectId}/conversations/{convId}/files/
   */
  private getConvFilesDir(): string {
    return getConversationFilesDir(this.projectId, this.convId);
  }

  /**
   * Get metadata file path for a file
   */
  private getMetaFilePath(filePath: string): string {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    return path.join(dir, `.${fileName}.meta.md`);
  }

  /**
   * Load metadata for a file from frontmatter format
   */
  private async loadFileMeta(filePath: string): Promise<FileMeta> {
    const metaPath = this.getMetaFilePath(filePath);

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
      return { scope: 'user' };
    }
  }

  /**
   * Save metadata for a file in frontmatter format
   */
  private async saveFileMeta(filePath: string, meta: FileMeta): Promise<void> {
    const metaPath = this.getMetaFilePath(filePath);

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
   * Resolve and validate a path within the base directory
   * Supports:
   * 1. Full path relative to project: {conv-id}/files/{filename}
   * 2. Simple filename relative to current conversation: {filename} -> {current-conv-id}/files/{filename}
   */
  private async resolvePath(userPath: string): Promise<string> {
    const baseDir = this.getBaseDir();
    await fs.mkdir(baseDir, { recursive: true });

    // 1. Try resolving strictly relative to Project Root (e.g. "other_conv_id/files/data.csv")
    let resolvedPath = path.resolve(baseDir, userPath);
    let relativePath = path.relative(baseDir, resolvedPath);
    let pathParts = relativePath.split(path.sep);

    // Check if it looks like a valid project-relative path: conversations/{conv-id}/files/...
    const isValidProjectRelative =
      resolvedPath.startsWith(baseDir) &&
      pathParts.length >= 3 &&
      pathParts[0] === "conversations" &&
      pathParts[2] === "files";

    if (!isValidProjectRelative) {
      // 2. If not valid project-relative, try resolving relative to CURRENT conversation files dir
      // This handles the common case: "data.csv" -> "conversations/current_conv/files/data.csv"
      const currentConvFilesDir = path.join(baseDir, "conversations", this.convId, "files");
      resolvedPath = path.resolve(currentConvFilesDir, userPath);

      // Re-validate against baseDir to ensure no directory traversal out of project
      if (!resolvedPath.startsWith(baseDir)) {
        throw new Error("Access denied: Path is outside allowed directory");
      }

      relativePath = path.relative(baseDir, resolvedPath);
      pathParts = relativePath.split(path.sep);
    }

    // Final Validation: Must be within SOME public/user conversation's "files" directory
    // Pattern: conversations/{any-conv-id}/files/{filename}
    if (pathParts.length < 3 || pathParts[0] !== "conversations" || pathParts[2] !== "files") {
      throw new Error(`Access denied: Path must be within conversations/{conv-id}/files/ subdirectories. Got: ${relativePath}`);
    }

    return resolvedPath;
  }

  async execute(args: {
    action: "list" | "search" | "recent" | "exists" | "info" | "delete" | "rename" | "uploadUrl" | "write" | "read" | "peek";
    path?: string;
    pattern?: string;
    limit?: number;
    timeRange?: "1h" | "24h" | "7d" | "30d" | "all";
    newPath?: string;
    url?: string;
    content?: string;
    offset?: number;
    scope?: FileScope;
  }): Promise<string> {
    try {
      switch (args.action) {
        case "list":
          return await this.listFiles(args.path, args.scope);
        case "search":
          if (!args.pattern) {
            throw new Error("pattern is required for search action");
          }
          return await this.searchFiles(args.pattern, args.limit, args.scope);
        case "recent":
          return await this.getRecentFiles(args.limit, args.timeRange, args.scope);
        case "exists":
          if (!args.path) {
            throw new Error("path is required for exists action");
          }
          return await this.fileExists(args.path);
        case "info":
          if (!args.path) {
            throw new Error("path is required for info action");
          }
          return await this.getFileInfo(args.path);
        case "delete":
          if (!args.path) {
            throw new Error("path is required for delete action");
          }
          return await this.deleteFile(args.path);
        case "rename":
          if (!args.path) {
            throw new Error("path is required for rename action");
          }
          if (!args.newPath) {
            throw new Error("newPath is required for rename action");
          }
          return await this.renameFile(args.path, args.newPath);
        case "uploadUrl":
          if (!args.url) {
            throw new Error("url is required for uploadUrl action");
          }
          if (!args.path) {
            throw new Error("path is required for uploadUrl action (destination filename)");
          }
          return await this.uploadFromUrl(args.url, args.path);
        case "write":
          if (!args.path) {
            throw new Error("path is required for write action");
          }
          if (args.content === undefined) {
            throw new Error("content is required for write action");
          }
          return await this.writeFile(args.path, args.content);
        case "read":
          if (!args.path) {
            throw new Error("path is required for read action");
          }
          return await this.readFile(args.path);
        case "peek":
          if (!args.path) {
            throw new Error("path is required for peek action");
          }
          return await this.peekFile(args.path, args.offset, args.limit);
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error: any) {
      throw new Error(`File operation failed: ${error.message}`);
    }
  }

  private async listFiles(dirPath?: string, scope?: FileScope): Promise<string> {
    const baseDir = this.getBaseDir();

    // If no path provided, list all files in all */files/* directories
    if (!dirPath) {
      // Check cache first
      const cached = this.getCachedList(scope);
      if (cached) {
        console.log(`[FileTool] Using cached file list for ${this.getCacheKey()}`);
        return cached;
      }

      const result = await this.listAllProjectFiles(scope);
      this.setCachedList(result);
      return result;
    }

    // If path provided, list files in that specific directory
    const resolvedPath = await this.resolvePath(dirPath);
    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const files: any[] = [];

    for (const entry of entries) {
      // Skip metadata files
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(resolvedPath, entry.name);

      // If it's a regular file (not directory), load its metadata
      if (!entry.isDirectory()) {
        const meta = await this.loadFileMeta(fullPath);

        // Filter by scope if specified
        if (scope && meta.scope !== scope) {
          continue;
        }
      }

      files.push({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        path: path.relative(baseDir, fullPath),
      });
    }

    return JSON.stringify(
      {
        directory: path.relative(baseDir, resolvedPath),
        baseDirectory: baseDir,
        count: files.length,
        scope: scope || "all",
        entries: files,
      },
      null,
      2
    );
  }

  private async listAllProjectFiles(scope?: FileScope): Promise<string> {
    const baseDir = this.getBaseDir();
    await fs.mkdir(baseDir, { recursive: true });

    const allFiles: any[] = [];

    try {
      // List all conversation directories in the project
      const conversationsDir = path.join(baseDir, "conversations");
      const entries = await fs.readdir(conversationsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const convId = entry.name;
        const filesDir = path.join(conversationsDir, convId, "files");

        // Check if files directory exists for this conversation
        try {
          await fs.access(filesDir);
          const stats = await fs.stat(filesDir);

          if (stats.isDirectory()) {
            // Recursively list all files in this conversation's files directory
            const files = await this.listFilesRecursive(filesDir, baseDir, scope);
            allFiles.push(...files);
          }
        } catch (error) {
          // Files directory doesn't exist for this conversation, skip it
          continue;
        }
      }

      return JSON.stringify(
        {
          baseDirectory: baseDir,
          totalFiles: allFiles.length,
          scope: scope || "all",
          files: allFiles,
        },
        null,
        2
      );
    } catch (error) {
      throw new Error(`Failed to list files: ${(error as Error).message}`);
    }
  }

  private async listFilesRecursive(dirPath: string, baseDir: string, scope?: FileScope): Promise<any[]> {
    const files: any[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip metadata files
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        // Recursively list files in subdirectories
        const subFiles = await this.listFilesRecursive(fullPath, baseDir, scope);
        files.push(...subFiles);
      } else {
        const stats = await fs.stat(fullPath);
        const meta = await this.loadFileMeta(fullPath);

        // Filter by scope if specified
        if (scope && meta.scope !== scope) {
          continue;
        }

        files.push({
          name: entry.name,
          path: relativePath,
          type: "file",
          size: stats.size,
          sizeHuman: this.formatBytes(stats.size),
          modified: stats.mtime.toISOString(),
          scope: meta.scope,
        });
      }
    }

    return files;
  }

  /**
   * Search files by name pattern (supports wildcards: *, ?)
   */
  private async searchFiles(pattern: string, limit: number = 20, scope?: FileScope): Promise<string> {
    const filesDir = this.getConvFilesDir();

    try {
      await fs.access(filesDir);
    } catch {
      // Files directory doesn't exist
      return JSON.stringify({
        action: "search",
        pattern,
        scope: scope || "all",
        totalFiles: 0,
        files: [],
      }, null, 2);
    }

    // Convert glob pattern to regex
    // * matches any characters, ? matches single character
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    const regex = new RegExp(`^${regexPattern}$`, "i");

    // Get all files and filter by pattern
    const baseDir = this.getBaseDir();
    const allFiles = await this.listFilesRecursive(filesDir, baseDir, scope);
    const matchedFiles = allFiles.filter((file: any) => regex.test(file.name));

    // Apply limit and sort by name
    const limitedFiles = matchedFiles
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
      .slice(0, limit);

    return JSON.stringify({
      action: "search",
      pattern,
      scope: scope || "all",
      totalMatched: matchedFiles.length,
      returned: limitedFiles.length,
      limit,
      files: limitedFiles,
    }, null, 2);
  }

  /**
   * Get recently modified files
   */
  private async getRecentFiles(
    limit: number = 20,
    timeRange: "1h" | "24h" | "7d" | "30d" | "all" = "24h",
    scope?: FileScope
  ): Promise<string> {
    const filesDir = this.getConvFilesDir();

    try {
      await fs.access(filesDir);
    } catch {
      // Files directory doesn't exist
      return JSON.stringify({
        action: "recent",
        timeRange,
        scope: scope || "all",
        totalFiles: 0,
        files: [],
      }, null, 2);
    }

    // Calculate time threshold
    const now = Date.now();
    let timeThreshold = 0;

    switch (timeRange) {
      case "1h":
        timeThreshold = now - 60 * 60 * 1000;
        break;
      case "24h":
        timeThreshold = now - 24 * 60 * 60 * 1000;
        break;
      case "7d":
        timeThreshold = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "30d":
        timeThreshold = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "all":
        timeThreshold = 0;
        break;
    }

    // Get all files and filter by time
    const allFiles = await this.listFilesRecursive(filesDir, baseDir, scope);
    const recentFiles = allFiles.filter((file: any) => {
      const modifiedTime = new Date(file.modified).getTime();
      return modifiedTime >= timeThreshold;
    });

    // Sort by modified time (newest first) and apply limit
    const limitedFiles = recentFiles
      .sort((a: any, b: any) => {
        const timeA = new Date(a.modified).getTime();
        const timeB = new Date(b.modified).getTime();
        return timeB - timeA;
      })
      .slice(0, limit);

    return JSON.stringify({
      action: "recent",
      timeRange,
      scope: scope || "all",
      totalFiles: recentFiles.length,
      returned: limitedFiles.length,
      limit,
      files: limitedFiles,
    }, null, 2);
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<string> {
    try {
      const resolvedPath = await this.resolvePath(filePath);
      const baseDir = this.getBaseDir();

      // Check if file exists
      await fs.access(resolvedPath);

      // Get file stats
      const stats = await fs.stat(resolvedPath);
      const meta = await this.loadFileMeta(resolvedPath);

      const relativePath = path.relative(baseDir, resolvedPath);

      return JSON.stringify({
        action: "exists",
        path: relativePath,
        exists: true,
        type: stats.isDirectory() ? "directory" : "file",
        size: stats.size,
        sizeHuman: this.formatBytes(stats.size),
        modified: stats.mtime.toISOString(),
        scope: meta.scope,
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        action: "exists",
        path: filePath,
        exists: false,
      }, null, 2);
    }
  }

  private async getFileInfo(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const baseDir = this.getBaseDir();
    const stats = await fs.stat(resolvedPath);

    // Load metadata for scope info
    const meta = await this.loadFileMeta(resolvedPath);

    return JSON.stringify(
      {
        path: path.relative(baseDir, resolvedPath),
        name: path.basename(resolvedPath),
        type: stats.isDirectory() ? "directory" : "file",
        size: stats.size,
        sizeHuman: this.formatBytes(stats.size),
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        permissions: stats.mode.toString(8).slice(-3),
        scope: meta.scope,
      },
      null,
      2
    );
  }

  private async deleteFile(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const baseDir = this.getBaseDir();
    const stats = await fs.stat(resolvedPath);
    const relativePath = path.relative(baseDir, resolvedPath);

    if (stats.isDirectory()) {
      await fs.rm(resolvedPath, { recursive: true });
    } else {
      await fs.unlink(resolvedPath);

      // Also delete metadata file
      const metaPath = this.getMetaFilePath(resolvedPath);
      try {
        await fs.unlink(metaPath);
      } catch (error) {
        // Metadata file might not exist, ignore
      }
    }

    // Invalidate cache after deletion
    this.invalidateCache();

    return JSON.stringify({
      success: true,
      message: stats.isDirectory() ? `Directory deleted: ${relativePath}` : `File deleted: ${relativePath}`,
      path: relativePath,
    });
  }

  private async renameFile(oldPath: string, newPath: string): Promise<string> {
    const resolvedOldPath = await this.resolvePath(oldPath);
    const resolvedNewPath = await this.resolvePath(newPath);
    const baseDir = this.getBaseDir();

    await fs.rename(resolvedOldPath, resolvedNewPath);

    // Also rename metadata file if it exists
    const oldMetaPath = this.getMetaFilePath(resolvedOldPath);
    const newMetaPath = this.getMetaFilePath(resolvedNewPath);

    try {
      await fs.rename(oldMetaPath, newMetaPath);
    } catch (error) {
      // Metadata file might not exist, ignore
    }

    // Invalidate cache after rename
    this.invalidateCache();

    const relativeOldPath = path.relative(baseDir, resolvedOldPath);
    const relativeNewPath = path.relative(baseDir, resolvedNewPath);

    return JSON.stringify({
      success: true,
      message: `Renamed: ${relativeOldPath} -> ${relativeNewPath}`,
      oldPath: relativeOldPath,
      newPath: relativeNewPath,
    });
  }

  private async uploadFromUrl(url: string, destPath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(destPath);
    const baseDir = this.getBaseDir();
    const relativePath = path.relative(baseDir, resolvedPath);

    // Ensure parent directory exists
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Download file from URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.status} ${response.statusText}`);
    }

    // Get content as buffer
    const buffer = await response.arrayBuffer();
    const nodeBuffer = Buffer.from(buffer);

    // Write to file
    await fs.writeFile(resolvedPath, nodeBuffer);

    // Save metadata with default 'user' scope
    await this.saveFileMeta(resolvedPath, { scope: 'user' });

    // Invalidate cache after upload
    this.invalidateCache();

    // Get file stats
    const stats = await fs.stat(resolvedPath);

    return JSON.stringify({
      success: true,
      message: `File uploaded from URL to: ${relativePath}`,
      url,
      path: relativePath,
      name: path.basename(resolvedPath),
      size: stats.size,
      sizeHuman: this.formatBytes(stats.size),
      created: stats.birthtime.toISOString(),
      scope: 'user',
    });
  }

  /**
   * Write content to a file (creates new file or overwrites existing)
   */
  private async writeFile(filePath: string, content: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const baseDir = this.getBaseDir();
    const relativePath = path.relative(baseDir, resolvedPath);

    // Ensure parent directory exists
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Write content to file
    await fs.writeFile(resolvedPath, content, 'utf-8');

    // Save metadata with default 'user' scope if creating new file
    try {
      await fs.access(resolvedPath);
      await this.saveFileMeta(resolvedPath, { scope: 'user' });
    } catch (error) {
      // File might already have metadata, ignore
    }

    // Invalidate cache after write
    this.invalidateCache();

    // Get file stats
    const stats = await fs.stat(resolvedPath);

    return JSON.stringify({
      success: true,
      message: `File written: ${relativePath}`,
      path: relativePath,
      name: path.basename(resolvedPath),
      size: stats.size,
      sizeHuman: this.formatBytes(stats.size),
      contentLength: content.length,
      created: stats.birthtime.toISOString(),
      scope: 'user',
    });
  }

  /**
   * Read file content with a maximum limit of ~8000 characters (roughly 2000 tokens)
   * Large files are truncated with a warning - no error is thrown
   */
  private async readFile(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const baseDir = this.getBaseDir();
    const stats = await fs.stat(resolvedPath);
    const relativePath = path.relative(baseDir, resolvedPath);
    const fileName = path.basename(resolvedPath);

    // Maximum characters to return (approximately 2000 tokens, assuming ~4 chars per token)
    const MAX_CHARS = 8000;

    // Read file content - use document extractor for .docx, .pdf, .xlsx, and .pptx files
    let content: string;
    if (isDocxFile(fileName) || isPdfFile(fileName) || isExcelFile(fileName) || isPowerPointFile(fileName)) {
      // Extract text from document files
      content = await extractTextFromFile(resolvedPath, fileName);
    } else {
      // Read as plain text
      content = await fs.readFile(resolvedPath, 'utf-8');
    }

    // Truncate if exceeds max length (don't error, just warn)
    let truncated = false;
    let returnedContent = content;
    let warning = undefined;

    if (content.length > MAX_CHARS) {
      returnedContent = content.substring(0, MAX_CHARS);
      truncated = true;
      warning = `⚠️ FILE TRUNCATED: This file has ${content.length} characters. Only first ${MAX_CHARS} characters (~2000 tokens) are shown. To read more, use: file({ action: 'peek', path: '${filePath}', offset: ${MAX_CHARS}, limit: 1000 })`;
    }

    return JSON.stringify({
      success: true,
      path: relativePath,
      name: fileName,
      size: stats.size,
      sizeHuman: this.formatBytes(stats.size),
      totalCharacters: content.length,
      returnedCharacters: returnedContent.length,
      truncated,
      warning,
      content: returnedContent,
    }, null, 2);
  }

  /**
   * Peek at file content with offset and limit for pagination
   */
  private async peekFile(filePath: string, offset?: number, limit?: number): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const baseDir = this.getBaseDir();
    const stats = await fs.stat(resolvedPath);
    const relativePath = path.relative(baseDir, resolvedPath);
    const fileName = path.basename(resolvedPath);

    // Set defaults
    const startOffset = offset ?? 0;
    const maxChars = limit ?? 1000;

    // Read file content - use document extractor for .docx, .pdf, .xlsx, and .pptx files
    let content: string;
    if (isDocxFile(fileName) || isPdfFile(fileName) || isExcelFile(fileName) || isPowerPointFile(fileName)) {
      // Extract text from document files
      content = await extractTextFromFile(resolvedPath, fileName);
    } else {
      // Read as plain text
      content = await fs.readFile(resolvedPath, 'utf-8');
    }

    // Validate offset
    if (startOffset < 0 || startOffset >= content.length) {
      throw new Error(`Invalid offset ${startOffset}. File has ${content.length} characters.`);
    }

    // Extract the requested portion
    const endOffset = Math.min(startOffset + maxChars, content.length);
    const peekContent = content.substring(startOffset, endOffset);

    return JSON.stringify({
      success: true,
      path: relativePath,
      name: fileName,
      size: stats.size,
      sizeHuman: this.formatBytes(stats.size),
      totalCharacters: content.length,
      offset: startOffset,
      limit: maxChars,
      returnedCharacters: peekContent.length,
      nextOffset: endOffset < content.length ? endOffset : null,
      hasMore: endOffset < content.length,
      content: peekContent,
    }, null, 2);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}
