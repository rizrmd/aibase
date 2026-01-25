/**
 * Extension storage service
 * Manages project-specific extensions stored in data/projects/{projectId}/extensions/{extensionId}/
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { getExtensionDir, getProjectExtensionsDir } from '../config/paths';

export interface ExampleEntry {
  title: string;
  description?: string;
  code: string;
  result?: string;
}

export interface FileExtractionConfig {
  supportedTypes: string[];      // ['pdf', 'docx', 'xlsx', 'pptx']
  outputFormat: 'markdown' | 'text';
}

export interface MessageUIConfig {
  componentName: string;          // React component name
  visualizationType: string;      // Type for __visualizations
}

export interface InspectionUIConfig {
  tabLabel: string;               // e.g., "Query Details"
  componentName: string;          // React component name
  showByDefault?: boolean;        // Auto-select this tab
}

export interface ExtensionMetadata {
  id: string;           // unique identifier (same as folder name)
  name: string;         // display name
  description: string;  // what the extension does
  author?: string;      // who created it
  version: string;      // semantic version
  category: string;     // category for grouping (e.g., "Database Tools", "Web Tools")
  enabled: boolean;     // whether it's active
  isDefault: boolean;   // whether it came from defaults
  createdAt: number;    // timestamp
  updatedAt: number;    // timestamp

  // NEW: Rich context/examples for LLM
  examples?: ExampleEntry[];

  // NEW: File extraction capabilities
  fileExtraction?: FileExtractionConfig;

  // NEW: Custom message UI components
  messageUI?: MessageUIConfig;

  // NEW: Inspection UI definition
  inspectionUI?: InspectionUIConfig;
}

export interface Extension {
  metadata: ExtensionMetadata;
  code: string;         // TypeScript source code
}

export interface CreateExtensionData {
  id: string;
  name: string;
  description: string;
  author?: string;
  version?: string;
  category?: string;
  code: string;
  enabled?: boolean;
  isDefault?: boolean;

  // NEW: Optional enhanced metadata
  examples?: ExampleEntry[];
  fileExtraction?: FileExtractionConfig;
  messageUI?: MessageUIConfig;
  inspectionUI?: InspectionUIConfig;
}

export interface UpdateExtensionData {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  code?: string;
  enabled?: boolean;

  // NEW: Optional enhanced metadata
  examples?: ExampleEntry[];
  fileExtraction?: FileExtractionConfig;
  messageUI?: MessageUIConfig;
  inspectionUI?: InspectionUIConfig;
}

export class ExtensionStorage {
  // No baseDir needed - using centralized path config

  constructor() {
    // No initialization needed
  }

  /**
   * Get extension directory path for a project
   */
  private getExtensionsDir(projectId: string, tenantId: number | string): string {
    return getProjectExtensionsDir(projectId, tenantId);
  }

  /**
   * Get specific extension directory path
   */
  private getExtensionDir(projectId: string, extensionId: string, tenantId: number | string): string {
    return getExtensionDir(projectId, extensionId, tenantId);
  }

  /**
   * Get metadata file path
   */
  private getMetadataPath(projectId: string, extensionId: string, tenantId: number | string): string {
    return path.join(this.getExtensionDir(projectId, extensionId, tenantId), 'metadata.json');
  }

  /**
   * Get code file path
   */
  private getCodePath(projectId: string, extensionId: string, tenantId: number | string): string {
    return path.join(this.getExtensionDir(projectId, extensionId, tenantId), 'index.ts');
  }

  /**
   * Ensure extensions directory exists
   */
  async ensureExtensionsDir(projectId: string, tenantId: number | string): Promise<void> {
    const extDir = this.getExtensionsDir(projectId, tenantId);
    await fs.mkdir(extDir, { recursive: true });
  }

  /**
   * Create a new extension
   */
  async create(projectId: string, tenantId: number | string, data: CreateExtensionData): Promise<Extension> {
    const now = Date.now();
    const extensionDir = this.getExtensionDir(projectId, data.id, tenantId);

    // Check if extension already exists
    try {
      await fs.access(extensionDir);
      throw new Error(`Extension '${data.id}' already exists`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Create extension directory
    await fs.mkdir(extensionDir, { recursive: true });

    // Create metadata
    const metadata: ExtensionMetadata = {
      id: data.id,
      name: data.name,
      description: data.description,
      author: data.author,
      version: data.version || '1.0.0',
      category: data.category ?? '',  // Use ?? instead of || to allow empty string
      enabled: data.enabled !== undefined ? data.enabled : true,
      isDefault: data.isDefault || false,
      createdAt: now,
      updatedAt: now,

      // NEW: Optional enhanced metadata
      examples: data.examples,
      fileExtraction: data.fileExtraction,
      messageUI: data.messageUI,
      inspectionUI: data.inspectionUI,
    };

    // Write metadata file
    await fs.writeFile(
      this.getMetadataPath(projectId, data.id, tenantId),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    // Write code file
    await fs.writeFile(
      this.getCodePath(projectId, data.id, tenantId),
      data.code,
      'utf-8'
    );

    console.log(`[ExtensionStorage] Created extension '${data.id}' for project ${projectId}`);
    return { metadata, code: data.code };
  }

  /**
   * Get extension by ID
   */
  async getById(projectId: string, extensionId: string, tenantId: number | string): Promise<Extension | null> {
    try {
      const metadataPath = this.getMetadataPath(projectId, extensionId, tenantId);
      const codePath = this.getCodePath(projectId, extensionId, tenantId);

      const [metadataContent, code] = await Promise.all([
        fs.readFile(metadataPath, 'utf-8'),
        fs.readFile(codePath, 'utf-8'),
      ]);

      const metadata = JSON.parse(metadataContent) as ExtensionMetadata;
      return { metadata, code };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all extensions for a project
   */
  async getAll(projectId: string, tenantId: number | string): Promise<Extension[]> {
    const extDir = this.getExtensionsDir(projectId, tenantId);

    try {
      await fs.access(extDir);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const entries = await fs.readdir(extDir, { withFileTypes: true });
    const extensionDirs = entries.filter(entry => entry.isDirectory());

    const extensions: Extension[] = [];

    for (const dir of extensionDirs) {
      try {
        const ext = await this.getById(projectId, dir.name, tenantId);
        if (ext) {
          extensions.push(ext);
        }
      } catch (error) {
        console.warn(`[ExtensionStorage] Failed to load extension '${dir.name}':`, error);
      }
    }

    // Sort by creation date (newest first)
    extensions.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);

    return extensions;
  }

  /**
   * Get all enabled extensions for a project
   */
  async getEnabled(projectId: string, tenantId: number | string): Promise<Extension[]> {
    const allExtensions = await this.getAll(projectId, tenantId);
    return allExtensions.filter(ext => ext.metadata.enabled);
  }

  /**
   * Update an extension
   */
  async update(projectId: string, extensionId: string, tenantId: number | string, updates: UpdateExtensionData): Promise<Extension | null> {
    const existing = await this.getById(projectId, extensionId, tenantId);
    if (!existing) {
      return null;
    }

    const now = Date.now();

    // Update metadata
    const updatedMetadata: ExtensionMetadata = {
      ...existing.metadata,
      name: updates.name !== undefined ? updates.name : existing.metadata.name,
      description: updates.description !== undefined ? updates.description : existing.metadata.description,
      author: updates.author !== undefined ? updates.author : existing.metadata.author,
      version: updates.version !== undefined ? updates.version : existing.metadata.version,
      category: updates.category !== undefined ? updates.category : existing.metadata.category,
      enabled: updates.enabled !== undefined ? updates.enabled : existing.metadata.enabled,
      updatedAt: now,

      // NEW: Optional enhanced metadata
      examples: updates.examples !== undefined ? updates.examples : existing.metadata.examples,
      fileExtraction: updates.fileExtraction !== undefined ? updates.fileExtraction : existing.metadata.fileExtraction,
      messageUI: updates.messageUI !== undefined ? updates.messageUI : existing.metadata.messageUI,
      inspectionUI: updates.inspectionUI !== undefined ? updates.inspectionUI : existing.metadata.inspectionUI,
    };

    // Update code if provided
    const updatedCode = updates.code !== undefined ? updates.code : existing.code;

    // Write updated metadata
    await fs.writeFile(
      this.getMetadataPath(projectId, extensionId, tenantId),
      JSON.stringify(updatedMetadata, null, 2),
      'utf-8'
    );

    // Write updated code if changed
    if (updates.code !== undefined) {
      await fs.writeFile(
        this.getCodePath(projectId, extensionId, tenantId),
        updatedCode,
        'utf-8'
      );
    }

    console.log(`[ExtensionStorage] Updated extension '${extensionId}' for project ${projectId}`);
    return { metadata: updatedMetadata, code: updatedCode };
  }

  /**
   * Delete an extension
   */
  async delete(projectId: string, extensionId: string, tenantId: number | string): Promise<boolean> {
    const extensionDir = this.getExtensionDir(projectId, extensionId, tenantId);

    try {
      await fs.rm(extensionDir, { recursive: true, force: true });
      console.log(`[ExtensionStorage] Deleted extension '${extensionId}' for project ${projectId}`);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Toggle extension enabled state
   */
  async toggle(projectId: string, extensionId: string, tenantId: number | string): Promise<Extension | null> {
    const existing = await this.getById(projectId, extensionId, tenantId);
    if (!existing) {
      return null;
    }

    return this.update(projectId, extensionId, tenantId, {
      enabled: !existing.metadata.enabled,
    });
  }

  /**
   * Check if extension exists
   */
  async exists(projectId: string, extensionId: string, tenantId: number | string): Promise<boolean> {
    const extensionDir = this.getExtensionDir(projectId, extensionId, tenantId);
    try {
      await fs.access(extensionDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get extensions by category
   */
  async getByCategory(projectId: string, category: string, tenantId: number | string): Promise<Extension[]> {
    const allExtensions = await this.getAll(projectId, tenantId);
    return allExtensions.filter(ext => ext.metadata.category === category);
  }

  /**
   * Get all unique categories for a project
   */
  async getCategories(projectId: string, tenantId: number | string): Promise<string[]> {
    const allExtensions = await this.getAll(projectId, tenantId);
    const categories = new Set(allExtensions.map(ext => ext.metadata.category));
    return Array.from(categories).sort();
  }

  /**
   * Get extensions grouped by category (for UI tree view)
   */
  async getByCategoryGrouped(projectId: string, tenantId: number | string): Promise<Record<string, Extension[]>> {
    const allExtensions = await this.getAll(projectId, tenantId);
    const grouped: Record<string, Extension[]> = {};

    for (const ext of allExtensions) {
      const category = ext.metadata.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(ext);
    }

    // Sort extensions within each category by name
    for (const category in grouped) {
      grouped[category].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    }

    return grouped;
  }

  /**
   * Remove category from all extensions in a specific category
   * Used when a category is deleted
   */
  async uncategorizeByCategory(projectId: string, categoryId: string, tenantId: number | string): Promise<void> {
    const extensions = await this.getByCategory(projectId, categoryId, tenantId);

    for (const ext of extensions) {
      try {
        await this.update(projectId, ext.metadata.id, tenantId, {
          category: "",
        });
        console.log(`[ExtensionStorage] Uncategorized extension '${ext.metadata.id}' from deleted category '${categoryId}'`);
      } catch (error) {
        console.error(`[ExtensionStorage] Failed to uncategorize extension '${ext.metadata.id}':`, error);
      }
    }
  }
}
