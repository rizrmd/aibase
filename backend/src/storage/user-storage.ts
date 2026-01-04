/**
 * User storage service using SQLite
 * Stores users in /data/users.db
 */

import { Database } from "bun:sqlite";
import * as path from 'path';
import * as fs from 'fs/promises';

export type UserRole = 'root' | 'admin' | 'user';

export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  role: UserRole;
  tenant_id: number | null; // null for root users, required for admin/user
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
  private db: Database;
  private dbPath: string;

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    this.dbPath = path.join(dataDir, 'users.db');
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

    // Create users table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        tenant_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
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
      this.db.run(`ALTER TABLE users ADD COLUMN tenant_id INTEGER`);
    } catch (error: any) {
      // Column already exists, ignore error
      if (!error.message?.includes('duplicate column name')) {
        throw error;
      }
    }

    // Create indexes for faster lookups
    this.db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');

    console.log('[UserStorage] Database initialized at', this.dbPath);
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<User> {
    const now = Date.now();
    const role = data.role || 'user'; // Default to 'user' role

    // Root users should not have tenant_id, admin/user must have tenant_id
    let tenantId = data.tenant_id;
    if (role === 'root') {
      tenantId = null;
    } else if (tenantId === undefined || tenantId === null) {
      throw new Error('Admin and user roles must belong to a tenant');
    }

    const stmt = this.db.prepare(`
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
        if (error.message.includes('username')) {
          throw new Error('Username already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  getById(id: number): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | null;
  }

  /**
   * Get user by email
   */
  getByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) as User | null;
  }

  /**
   * Get user by username
   */
  getByUsername(username: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | null;
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

    const stmt = this.db.prepare(`
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
        if (error.message.includes('username')) {
          throw new Error('Username already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete user
   */
  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get all users (without password hashes for security)
   */
  getAll(): Omit<User, 'password_hash'>[] {
    const stmt = this.db.prepare('SELECT id, email, username, role, tenant_id, created_at, updated_at FROM users');
    return stmt.all() as Omit<User, 'password_hash'>[];
  }

  /**
   * Get all users for a specific tenant
   */
  getByTenantId(tenantId: number): Omit<User, 'password_hash'>[] {
    const stmt = this.db.prepare('SELECT id, email, username, role, tenant_id, created_at, updated_at FROM users WHERE tenant_id = ?');
    return stmt.all(tenantId) as Omit<User, 'password_hash'>[];
  }

  /**
   * Get users by role
   */
  getByRole(role: UserRole): User[] {
    const stmt = this.db.prepare('SELECT * FROM users WHERE role = ?');
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
      'root': 3,
    };

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }

  /**
   * Check if a root user exists
   */
  hasRootUser(): boolean {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?');
    const result = stmt.get('root') as { count: number };
    return result.count > 0;
  }

  /**
   * Count total users
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
