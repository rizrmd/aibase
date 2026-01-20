import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";
import { extractTextFromFile, isDocxFile, isPdfFile } from "../../utils/document-extractor";

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

**Available actions:** list, info, delete, rename, uploadUrl, write, read, peek

**File Scopes:**
- user: Only visible to the user who uploaded (default)
- public: Visible to all users in the conversation

**Supported File Types:**
- Plain text files (.txt, .md, .json, .csv, etc.)
- Word documents (.docx) - text is automatically extracted
- PDF documents (.pdf) - text is automatically extracted using unpdf
- Other binary formats may not be readable

### Examples:
\`\`\`typescript
// List all files in current conversation
await file({ action: 'list' });

// List only public files
await file({ action: 'list', scope: 'public' });

// Get file information
await file({ action: 'info', path: 'document.pdf' });

// Delete a file
await file({ action: 'delete', path: 'old-file.txt' });

// Rename/move a file
await file({ action: 'rename', path: 'old-name.txt', newPath: 'new-name.txt' });

// Upload file from URL
await file({ action: 'uploadUrl', url: 'https://example.com/file.pdf', path: 'downloaded.pdf' });

// Write content to a file (creates new or overwrites existing)
await file({ action: 'write', path: 'output.txt', content: 'Hello World' });

// Read file content (returns up to ~8000 characters, roughly 2000 tokens)
// For .docx files, text is automatically extracted
// PDF files are NOT supported - ask user to convert to .txt or .docx
await file({ action: 'read', path: 'data.json' });
await file({ action: 'read', path: 'document.docx' });

// Peek at file with offset and limit (for paginated reading)
await file({ action: 'peek', path: 'large-file.log', offset: 0, limit: 100 });
\`\`\``;
};

/**
 * File Tool - Built-in file operations
 * Actions: list, info, delete, rename, uploadUrl, write, read, peek
 * All operations are restricted to /data/{proj-id}/{conv-id}/files/ pattern
 */
export class FileTool extends Tool {
  name = "file";
  description = "Perform file operations: list files in directory, get file info, delete file, rename/move file, upload file from URL, write content to file, read file content (max 8000 chars ~2000 tokens), or peek at file with pagination. All paths are relative to the project directory (/data/{proj-id}/) and must be within {conv-id}/files/ subdirectories.";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "info", "delete", "rename", "uploadUrl", "write", "read", "peek"],
        description: "The action to perform",
      },
      path: {
        type: "string",
        description: "File or directory path relative to project directory (must be within {conv-id}/files/ subdirectories). For list action, defaults to listing all files across all conversations if not specified. For uploadUrl/write/read/peek, this is the filename.",
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
      limit: {
        type: "number",
        description: "Maximum number of characters to return for peek action (default: 1000)",
      },
      scope: {
        type: "string",
        enum: ["user", "public"],
        description: "Filter files by scope (optional, only applies to list action). If not specified, returns all files regardless of scope.",
      },
    },
    required: ["action"],
  };

  private convId: string = "default";
  private projectId: string = "A1";

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
   * Get the base directory for file operations
   */
  private getBaseDir(): string {
    return path.join(process.cwd(), "data", this.projectId);
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

    // Check if it looks like a valid project-relative path: {conv-id}/files/...
    const isValidProjectRelative =
      resolvedPath.startsWith(baseDir) &&
      pathParts.length >= 2 &&
      pathParts[1] === "files";

    if (!isValidProjectRelative) {
      // 2. If not valid project-relative, try resolving relative to CURRENT conversation files dir
      // This handles the common case: "data.csv" -> "current_conv/files/data.csv"
      const currentConvFilesDir = path.join(baseDir, this.convId, "files");
      resolvedPath = path.resolve(currentConvFilesDir, userPath);

      // Re-validate against baseDir to ensure no directory traversal out of project
      if (!resolvedPath.startsWith(baseDir)) {
        throw new Error("Access denied: Path is outside allowed directory");
      }

      relativePath = path.relative(baseDir, resolvedPath);
      pathParts = relativePath.split(path.sep);
    }

    // Final Validation: Must be within SOME public/user conversation's "files" directory
    // Pattern: {any-conv-id}/files/{filename}
    if (pathParts.length < 2 || pathParts[1] !== "files") {
      throw new Error(`Access denied: Path must be within {conv-id}/files/ subdirectories. Got: ${relativePath}`);
    }

    return resolvedPath;
  }

  async execute(args: {
    action: "list" | "info" | "delete" | "rename" | "uploadUrl" | "write" | "read" | "peek";
    path?: string;
    newPath?: string;
    url?: string;
    content?: string;
    offset?: number;
    limit?: number;
    scope?: FileScope;
  }): Promise<string> {
    try {
      switch (args.action) {
        case "list":
          return await this.listFiles(args.path, args.scope);
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
      return await this.listAllProjectFiles(scope);
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
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const convId = entry.name;
        const filesDir = path.join(baseDir, convId, "files");

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
      return JSON.stringify({
        success: true,
        message: `Directory deleted: ${relativePath}`,
        path: relativePath,
      });
    } else {
      await fs.unlink(resolvedPath);

      // Also delete metadata file
      const metaPath = this.getMetaFilePath(resolvedPath);
      try {
        await fs.unlink(metaPath);
      } catch (error) {
        // Metadata file might not exist, ignore
      }

      return JSON.stringify({
        success: true,
        message: `File deleted: ${relativePath}`,
        path: relativePath,
      });
    }
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

    // Read file content - use document extractor for .docx and .pdf files
    let content: string;
    if (isDocxFile(fileName) || isPdfFile(fileName)) {
      // Extract text from .docx or .pdf file
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

    // Read file content - use document extractor for .docx and .pdf files
    let content: string;
    if (isDocxFile(fileName) || isPdfFile(fileName)) {
      // Extract text from .docx or .pdf file
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
