/**
 * User storage service using SQLite
 * Stores users in data/app/databases/users.db
 */

import { Database } from "bun:sqlite";
import * as path from 'path';
import * as fs from 'fs/promises';
import { PATHS } from '../config/paths';

export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  role: UserRole;
  tenant_id: number; // required for admin/user
  created_at: number;
  updated_at: number;
}

export interface CreateUserData {
  email: string;
  username: string;
  password_hash: string;
  role?: UserRole;
  tenant_id?: number | null;
}

export interface UpdateUserData {
  email?: string;
  username?: string;
  password_hash?: string;
  role?: UserRole;
  tenant_id?: number | null;
}

export class UserStorage {
  private static instance: UserStorage;
  private db: Database | null = null;

  private constructor() {
    // Don't cache dbPath in constructor, evaluate it dynamically
  }

  private get dbPath(): string {
    return PATHS.USERS_DB;
  }

  private getDatabase(): Database {
    if (!this.db) {
      throw new Error('UserStorage not initialized. Call initialize() first.');
    }
    return this.db;
  }

  static getInstance(): UserStorage {
    if (!UserStorage.instance) {
      UserStorage.instance = new UserStorage();
    }
    return UserStorage.instance;
  }

  /**
   * Initialize the database and create tables
   */
  async initialize(): Promise<void> {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    await fs.mkdir(dataDir, { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Check if we need to migrate from old schema to new schema
    // Old schema: UNIQUE constraint on username alone
    // New schema: UNIQUE constraint on (username, tenant_id) composite
    const needsMigration = await this.checkNeedsMigration();

    if (needsMigration) {
      console.log('[UserStorage] Migrating database schema for multi-tenant username uniqueness...');
      await this.migrateSchema();
    }

    // Create users table with correct schema if it doesn't exist
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        tenant_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE(username, tenant_id)
      )
    `);

    // Add role column if it doesn't exist (for existing databases)
    try {
      this.db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
    } catch (error: any) {
      // Column already exists, ignore error
      if (!error.message?.includes('duplicate column name')) {
        throw error;
      }
    }

    // Add tenant_id column if it doesn't exist (for existing databases)
    try {
      this.db.run(`ALTER TABLE users ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1`);
    } catch (error: any) {
      // Column already exists, ignore error
      if (!error.message?.includes('duplicate column name')) {
        throw error;
      }
    }

    // Create indexes for faster lookups
    this.db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');

    // Remove old single-column username index if it exists
    // The composite UNIQUE constraint provides the indexing benefit
    try {
      this.db.run('DROP INDEX IF EXISTS idx_users_username');
    } catch (error: any) {
      // Index doesn't exist or other error, ignore
    }

    console.log('[UserStorage] Database initialized at', this.dbPath);
  }

  /**
   * Check if database needs migration from old schema to new schema
   * Old: UNIQUE constraint on username alone (username TEXT UNIQUE NOT NULL)
   * New: UNIQUE constraint on (username, tenant_id) composite
   */
  private async checkNeedsMigration(): Promise<boolean> {
    try {
      const db = this.getDatabase();
      // Get the actual CREATE TABLE SQL from sqlite_master
      const tableSchema = db.prepare(`
        SELECT sql FROM sqlite_master WHERE type='table' AND name='users'
      `).get() as { sql: string } | undefined;

      if (!tableSchema?.sql) {
        // Table doesn't exist, no migration needed
        return false;
      }

      // Check if the old schema (single-column UNIQUE on username) exists
      // Old schema pattern: username TEXT UNIQUE NOT NULL
      // New schema pattern: username TEXT NOT NULL, with UNIQUE(username, tenant_id) at the end
      const hasOldSingleColumnUnique = tableSchema.sql.includes('username TEXT UNIQUE');

      if (hasOldSingleColumnUnique) {
        console.log('[UserStorage] Detected old schema with single-column username UNIQUE constraint');
        return true;
      }

      // Check if the new composite unique constraint exists
      const hasNewCompositeUnique = tableSchema.sql.includes('UNIQUE(username, tenant_id)');

      if (!hasNewCompositeUnique) {
        console.log('[UserStorage] No composite unique constraint found, migration needed');
        return true;
      }

      // Check if tenant_id is NOT NULL
      const hasNotNullTenantId = tableSchema.sql.includes('tenant_id INTEGER NOT NULL');
      if (!hasNotNullTenantId) {
        console.log('[UserStorage] tenant_id is not NOT NULL, migration needed');
        return true;
      }

      return false;
    } catch (error) {
      // If there's any error checking, assume no migration needed
      console.error('[UserStorage] Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Migrate database schema from old to new
   * Old: UNIQUE constraint on username alone
   * New: UNIQUE constraint on (username, tenant_id) composite
   */
  private async migrateSchema(): Promise<void> {
    try {
      const db = this.getDatabase();
      // Begin transaction
      db.run('BEGIN TRANSACTION');

      // Create new table with composite unique constraint
      db.run(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          tenant_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
          UNIQUE(username, tenant_id)
        )
      `);

      // Copy data from old table to new table
      // For users with NULL tenant_id, set tenant_id to 1 (default tenant)
      db.run(`
        INSERT INTO users_new (id, email, username, password_hash, role, tenant_id, created_at, updated_at)
        SELECT
          id,
          email,
          username,
          password_hash,
          COALESCE(role, 'user') as role,
          COALESCE(tenant_id, 1) as tenant_id,
          created_at,
          updated_at
        FROM users
      `);

      // Drop old table
      db.run('DROP TABLE users');

      // Rename new table to users
      db.run('ALTER TABLE users_new RENAME TO users');

      // Create indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');

      // Commit transaction
      db.run('COMMIT');

      console.log('[UserStorage] Schema migration completed successfully');
    } catch (error: any) {
      // Rollback on error
      try {
        const db = this.getDatabase();
        db.run('ROLLBACK');
      } catch (rollbackError) {
        // Ignore rollback errors
      }
      console.error('[UserStorage] Schema migration failed:', error);
      throw new Error(`Failed to migrate database schema: ${error.message}`);
    }
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<User> {
    const now = Date.now();
    const role = data.role || 'user'; // Default to 'user' role

    // All users must belong to a tenant
    const tenantId = data.tenant_id;
    if (tenantId === undefined || tenantId === null) {
      throw new Error('Admin and user roles must belong to a tenant');
    }

    const db = this.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO users (email, username, password_hash, role, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(data.email, data.username, data.password_hash, role, tenantId, now, now);
      const user = this.getById(result.lastInsertRowid as number);

      if (!user) {
        throw new Error('Failed to create user');
      }

      console.log('[UserStorage] Created user:', user.username);
      return user;
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        if (error.message.includes('email')) {
          throw new Error('Email already exists');
        }
        if (error.message.includes('username') && error.message.includes('tenant_id')) {
          throw new Error('Username already exists in this tenant');
        }
      }
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  getById(id: number): User | null {
    const db = this.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const result = stmt.get(id) as User | undefined;
    return result ?? null;
  }

  /**
   * Get user by email
   */
  getByEmail(email: string): User | null {
    const db = this.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const result = stmt.get(email) as User | undefined;
    return result ?? null;
  }

  /**
   * Get user by username
   */
  getByUsername(username: string): User | null {
    const db = this.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const result = stmt.get(username) as User | undefined;
    return result ?? null;
  }

  /**
   * Update user
   */
  async update(id: number, data: UpdateUserData): Promise<User | null> {
    const user = this.getById(id);
    if (!user) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email);
    }
    if (data.username !== undefined) {
      updates.push('username = ?');
      values.push(data.username);
    }
    if (data.password_hash !== undefined) {
      updates.push('password_hash = ?');
      values.push(data.password_hash);
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      values.push(data.role);
    }
    if (data.tenant_id !== undefined) {
      updates.push('tenant_id = ?');
      values.push(data.tenant_id);
    }

    if (updates.length === 0) {
      return user;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const db = this.getDatabase();
    const stmt = db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `);

    try {
      stmt.run(...values);
      return this.getById(id);
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        if (error.message.includes('email')) {
          throw new Error('Email already exists');
        }
        if (error.message.includes('username') && error.message.includes('tenant_id')) {
          throw new Error('Username already exists in this tenant');
        }
      }
      throw error;
    }
  }

  /**
   * Delete user
   */
  async delete(id: number): Promise<boolean> {
    const db = this.getDatabase();
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get all users (without password hashes for security)
   */
  getAll(): Omit<User, 'password_hash'>[] {
    const db = this.getDatabase();
    const stmt = db.prepare('SELECT id, email, username, role, tenant_id, created_at, updated_at FROM users');
    return stmt.all() as Omit<User, 'password_hash'>[];
  }

  /**
   * Get all users for a specific tenant
   */
  getByTenantId(tenantId: number): Omit<User, 'password_hash'>[] {
    const db = this.getDatabase();
    const stmt = db.prepare('SELECT id, email, username, role, tenant_id, created_at, updated_at FROM users WHERE tenant_id = ?');
    return stmt.all(tenantId) as Omit<User, 'password_hash'>[];
  }

  /**
   * Get users by role
   */
  getByRole(role: UserRole): User[] {
    const db = this.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE role = ?');
    return stmt.all(role) as User[];
  }

  /**
   * Check if user has a specific role or higher
   */
  hasRole(userId: number, requiredRole: UserRole): boolean {
    const user = this.getById(userId);
    if (!user) return false;

    const roleHierarchy: Record<UserRole, number> = {
      'user': 1,
      'admin': 2,
    };

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }

  /**
   * Count total users
   */
  count(): number {
    const db = this.getDatabase();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
