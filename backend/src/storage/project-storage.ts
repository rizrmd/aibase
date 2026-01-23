/**
 * Project storage service using SQLite
 * Stores projects in data/app/databases/projects.db
 */

import { Database } from "bun:sqlite";
import * as path from 'path';
import * as fs from 'fs/promises';
import { PATHS } from '../config/paths';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  user_id: number; // Owner of the project
  tenant_id: number | null; // Tenant the project belongs to
  is_shared: boolean; // Whether project is shared within tenant
  is_embeddable: boolean; // Whether project can be embedded publicly
  embed_token: string | null; // Secret token for embed verification
  custom_embed_css: string | null; // Custom CSS for embedded chat
  welcome_message: string | null; // Custom welcome message for embedded chat
  show_history: boolean; // Show conversation history
  show_files: boolean; // Show files tab
  show_context: boolean; // Show context tab
  show_memory: boolean; // Show memory tab
  use_client_uid: boolean; // Allow client to provide uid for persistence
  created_at: number;
  updated_at: number;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  user_id: number;
  tenant_id?: number | null;
  is_shared?: boolean;
  show_history?: boolean;
  show_files?: boolean;
  show_context?: boolean;
  show_memory?: boolean;
  use_client_uid?: boolean;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  is_shared?: boolean;
  show_history?: boolean;
  show_files?: boolean;
  show_context?: boolean;
  show_memory?: boolean;
  use_client_uid?: boolean;
}

export class ProjectStorage {
  private static instance: ProjectStorage;
  private db: Database;
  private dbPath: string;
  private baseDir: string;

  private constructor() {
    this.dbPath = PATHS.PROJECTS_DB;
    this.baseDir = PATHS.PROJECTS_DIR;
  }

  static getInstance(): ProjectStorage {
    if (!ProjectStorage.instance) {
      ProjectStorage.instance = new ProjectStorage();
    }
    return ProjectStorage.instance;
  }

  /**
   * Initialize the database and create tables
   */
  async initialize(): Promise<void> {
    // Ensure data directory exists
    await fs.mkdir(PATHS.APP_DATABASES, { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Create projects table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        user_id INTEGER NOT NULL,
        tenant_id INTEGER,
        is_shared INTEGER NOT NULL DEFAULT 0,
        show_history INTEGER NOT NULL DEFAULT 1,
        show_files INTEGER NOT NULL DEFAULT 1,
        show_context INTEGER NOT NULL DEFAULT 1,
        show_memory INTEGER NOT NULL DEFAULT 1,
        use_client_uid INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for faster lookups
    this.db.run('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_projects_is_shared ON projects(is_shared)');

    // Migration: Add embed fields if they don't exist
    try {
      const tableInfo = this.db.prepare('PRAGMA table_info(projects)').all() as any[];
      const hasEmbeddableColumn = tableInfo.some((col: any) => col.name === 'is_embeddable');
      const hasEmbedTokenColumn = tableInfo.some((col: any) => col.name === 'embed_token');
      const hasCustomEmbedCssColumn = tableInfo.some((col: any) => col.name === 'custom_embed_css');
      const hasWelcomeMessageColumn = tableInfo.some((col: any) => col.name === 'welcome_message');
      const hasShowHistoryColumn = tableInfo.some((col: any) => col.name === 'show_history');
      const hasShowFilesColumn = tableInfo.some((col: any) => col.name === 'show_files');
      const hasShowContextColumn = tableInfo.some((col: any) => col.name === 'show_context');
      const hasShowMemoryColumn = tableInfo.some((col: any) => col.name === 'show_memory');
      const hasUseClientUidColumn = tableInfo.some((col: any) => col.name === 'use_client_uid');

      if (!hasEmbeddableColumn || !hasEmbedTokenColumn || !hasCustomEmbedCssColumn || !hasWelcomeMessageColumn ||
        !hasShowHistoryColumn || !hasShowFilesColumn || !hasShowContextColumn || !hasShowMemoryColumn || !hasUseClientUidColumn) {
        console.log('[ProjectStorage] Migrating database: adding embed fields');
        this.db.run('BEGIN TRANSACTION');

        if (!hasEmbeddableColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN is_embeddable INTEGER NOT NULL DEFAULT 0');
        }

        if (!hasEmbedTokenColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN embed_token TEXT NULL');
        }

        if (!hasCustomEmbedCssColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN custom_embed_css TEXT NULL');
        }

        if (!hasWelcomeMessageColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN welcome_message TEXT NULL');
        }

        if (!hasShowHistoryColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN show_history INTEGER NOT NULL DEFAULT 1');
        }

        if (!hasShowFilesColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN show_files INTEGER NOT NULL DEFAULT 1');
        }

        if (!hasShowContextColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN show_context INTEGER NOT NULL DEFAULT 1');
        }

        if (!hasShowMemoryColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN show_memory INTEGER NOT NULL DEFAULT 1');
        }

        if (!hasUseClientUidColumn) {
          this.db.run('ALTER TABLE projects ADD COLUMN use_client_uid INTEGER NOT NULL DEFAULT 0');
        }

        // Create index for embed_token lookups
        this.db.run('CREATE INDEX IF NOT EXISTS idx_projects_embed_token ON projects(embed_token)');

        this.db.run('COMMIT');
        console.log('[ProjectStorage] Migration completed: embed fields added');
      }
    } catch (error) {
      console.error('[ProjectStorage] Embed fields migration failed:', error);
      this.db.run('ROLLBACK');
      throw error;
    }

    // Migration: Remove is_default column if it exists
    try {
      // Check if column exists
      const tableInfo = this.db.prepare('PRAGMA table_info(projects)').all() as any[];
      const hasIsDefaultColumn = tableInfo.some((col: any) => col.name === 'is_default');

      if (hasIsDefaultColumn) {
        console.log('[ProjectStorage] Migrating database: removing is_default column');

        // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
        this.db.run('BEGIN TRANSACTION');

        // Create new table without is_default
        this.db.run(`
          CREATE TABLE projects_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            user_id INTEGER NOT NULL,
            tenant_id INTEGER,
            is_shared INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
          )
        `);

        // Copy data from old table to new table
        this.db.run(`
          INSERT INTO projects_new (id, name, description, user_id, tenant_id, is_shared, created_at, updated_at)
          SELECT id, name, description, user_id, tenant_id, is_shared, created_at, updated_at
          FROM projects
        `);

        // Drop old table
        this.db.run('DROP TABLE projects');

        // Rename new table to original name
        this.db.run('ALTER TABLE projects_new RENAME TO projects');

        // Recreate indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_projects_is_shared ON projects(is_shared)');

        this.db.run('COMMIT');
        console.log('[ProjectStorage] Migration completed: is_default column removed');
      }
    } catch (error) {
      console.error('[ProjectStorage] Migration failed:', error);
      this.db.run('ROLLBACK');
      throw error;
    }

    console.log('[ProjectStorage] Database initialized at', this.dbPath);
  }

  /**
   * Generate unique project ID
   */
  private generateId(): string {
    const timestamp = Date.now();
    return `proj_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new project
   */
  async create(data: CreateProjectData): Promise<Project> {
    const now = Date.now();
    const id = this.generateId();
    const is_shared = data.is_shared ?? false;

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, description, user_id, tenant_id, is_shared, is_embeddable, embed_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.description ?? null,
      data.user_id,
      data.tenant_id ?? null,
      is_shared ? 1 : 0,
      id, // Use project ID as embed token
      now,
      now
    );

    // Update with default values if provided
    if (data.show_history !== undefined || data.show_files !== undefined ||
      data.show_context !== undefined || data.show_memory !== undefined || data.use_client_uid !== undefined) {

      const updates: string[] = [];
      const values: any[] = [];

      if (data.show_history !== undefined) { updates.push('show_history = ?'); values.push(data.show_history ? 1 : 0); }
      if (data.show_files !== undefined) { updates.push('show_files = ?'); values.push(data.show_files ? 1 : 0); }
      if (data.show_context !== undefined) { updates.push('show_context = ?'); values.push(data.show_context ? 1 : 0); }
      if (data.show_memory !== undefined) { updates.push('show_memory = ?'); values.push(data.show_memory ? 1 : 0); }
      if (data.use_client_uid !== undefined) { updates.push('use_client_uid = ?'); values.push(data.use_client_uid ? 1 : 0); }

      values.push(id);

      this.db.run(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, ...values);
    }

    // Create project directory
    const projectDir = this.getProjectDir(id);
    await fs.mkdir(projectDir, { recursive: true });

    const project = this.getById(id);
    if (!project) {
      throw new Error('Failed to create project');
    }

    console.log('[ProjectStorage] Created project:', project.name);
    return project;
  }

  /**
   * Get project by ID
   */
  getById(id: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      ...row,
      is_shared: row.is_shared === 1,
      is_embeddable: row.is_embeddable === 1,
      show_history: row.show_history === 1,
      show_files: row.show_files === 1,
      show_context: row.show_context === 1,
      show_memory: row.show_memory === 1,
    };
  }

  /**
   * Get all projects for a specific user
   * Returns user's own projects + shared projects in their tenant
   */
  getByUserId(userId: number, tenantId: number | null): Project[] {
    let stmt;
    let rows;

    if (tenantId !== null) {
      // Get user's own projects + shared projects in the same tenant
      stmt = this.db.prepare(`
        SELECT * FROM projects
        WHERE (user_id = ? OR (tenant_id = ? AND is_shared = 1))
        ORDER BY created_at DESC
      `);
      rows = stmt.all(userId, tenantId) as any[];
    } else {
      // No tenant - only get user's own projects
      stmt = this.db.prepare(`
        SELECT * FROM projects
        WHERE user_id = ?
        ORDER BY created_at DESC
      `);
      rows = stmt.all(userId) as any[];
    }

    return rows.map(row => ({
      ...row,
      is_shared: row.is_shared === 1,
      is_embeddable: row.is_embeddable === 1,
      show_history: row.show_history === 1,
      show_files: row.show_files === 1,
      show_context: row.show_context === 1,
      show_memory: row.show_memory === 1,
    }));
  }

  /**
   * Get all projects (admin only)
   */
  getAll(): Project[] {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      ...row,
      is_shared: row.is_shared === 1,
      is_embeddable: row.is_embeddable === 1,
      show_history: row.show_history === 1,
      show_files: row.show_files === 1,
      show_context: row.show_context === 1,
      show_memory: row.show_memory === 1,
    }));
  }

  /**
   * Check if user has access to a project
   */
  userHasAccess(projectId: string, userId: number, tenantId: number | null): boolean {
    const project = this.getById(projectId);
    if (!project) return false;

    // User owns the project
    if (project.user_id === userId) return true;

    // Project is shared in user's tenant
    if (project.is_shared && project.tenant_id === tenantId && tenantId !== null) {
      return true;
    }

    return false;
  }

  /**
   * Update a project
   */
  async update(id: string, userId: number, updates: UpdateProjectData): Promise<Project | null> {
    const project = this.getById(id);
    if (!project) return null;

    // Only owner can update
    if (project.user_id !== userId) {
      throw new Error('Only the project owner can update the project');
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.is_shared !== undefined) {
      fields.push('is_shared = ?');
      values.push(updates.is_shared ? 1 : 0);
    }
    if (updates.show_history !== undefined) {
      fields.push('show_history = ?');
      values.push(updates.show_history ? 1 : 0);
    }
    if (updates.show_files !== undefined) {
      fields.push('show_files = ?');
      values.push(updates.show_files ? 1 : 0);
    }
    if (updates.show_context !== undefined) {
      fields.push('show_context = ?');
      values.push(updates.show_context ? 1 : 0);
    }
    if (updates.show_memory !== undefined) {
      fields.push('show_memory = ?');
      values.push(updates.show_memory ? 1 : 0);
    }
    if (updates.use_client_uid !== undefined) {
      fields.push('use_client_uid = ?');
      values.push(updates.use_client_uid ? 1 : 0);
    }

    if (fields.length === 0) {
      return project;
    }

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE projects SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
    return this.getById(id);
  }

  /**
   * Delete a project
   */
  async delete(id: string, userId: number): Promise<boolean> {
    const project = this.getById(id);
    if (!project) return false;

    // Only owner can delete
    if (project.user_id !== userId) {
      throw new Error('Only the project owner can delete the project');
    }

    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes > 0) {
      // Delete project directory
      const projectDir = this.getProjectDir(id);
      try {
        await fs.rm(projectDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to delete project directory ${projectDir}:`, error);
      }
    }

    return result.changes > 0;
  }

  /**
   * Get project directory path
   */
  getProjectDir(projectId: string): string {
    return path.join(this.baseDir, projectId);
  }

  /**
   * Ensure project directory exists
   */
  async ensureProjectDir(projectId: string): Promise<void> {
    const projectDir = this.getProjectDir(projectId);
    await fs.mkdir(projectDir, { recursive: true });
  }

  /**
   * Regenerate embed token for a project
   * Note: We use the project ID as the embed token, so this just returns the project ID
   */
  async regenerateEmbedToken(projectId: string, userId: number): Promise<string> {
    const project = this.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Only owner can regenerate token
    if (project.user_id !== userId) {
      throw new Error('Only the project owner can regenerate the embed token');
    }

    // Just return the project ID since we use it as the embed token
    console.log('[ProjectStorage] Embed token is the project ID for:', projectId);
    return projectId;
  }

  /**
   * Update custom embed CSS for a project
   */
  async updateEmbedCss(projectId: string, userId: number, customCss: string): Promise<void> {
    const project = this.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Only owner can update embed CSS
    if (project.user_id !== userId) {
      throw new Error('Only the project owner can update embed CSS');
    }

    const stmt = this.db.prepare(`
      UPDATE projects SET custom_embed_css = ?, updated_at = ? WHERE id = ?
    `);

    stmt.run(customCss, Date.now(), projectId);
    console.log('[ProjectStorage] Updated embed CSS for project:', projectId);
  }

  /**
   * Update welcome message for a project
   */
  async updateWelcomeMessage(projectId: string, userId: number, welcomeMessage: string | null): Promise<void> {
    const project = this.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Only owner can update welcome message
    if (project.user_id !== userId) {
      throw new Error('Only the project owner can update welcome message');
    }

    const stmt = this.db.prepare(`
      UPDATE projects SET welcome_message = ?, updated_at = ? WHERE id = ?
    `);

    stmt.run(welcomeMessage, Date.now(), projectId);
    console.log('[ProjectStorage] Updated welcome message for project:', projectId);
  }

  /**
   * Get project by embed token (for public embed access)
   */
  getByEmbedToken(embedToken: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE embed_token = ? AND is_embeddable = 1');
    const row = stmt.get(embedToken) as any;

    if (!row) return null;

    return {
      ...row,
      is_shared: row.is_shared === 1,
      is_embeddable: row.is_embeddable === 1,
      show_history: row.show_history === 1,
      show_files: row.show_files === 1,
      show_context: row.show_context === 1,
      show_memory: row.show_memory === 1,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
