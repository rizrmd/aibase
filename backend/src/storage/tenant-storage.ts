/**
 * Tenant storage service using SQLite
 * Stores tenants in data/app/databases/users.db (same database as users and sessions)
 */

import { Database } from "bun:sqlite";
import * as path from 'path';
import * as fs from 'fs/promises';
import { PATHS } from '../config/paths';

export interface Tenant {
  id: number;
  name: string;
  domain: string | null;
  has_logo: boolean; // Whether logo file exists
  created_at: number;
  updated_at: number;
}

export interface CreateTenantData {
  name: string;
  slug?: string;
  domain?: string | null;
  logo_url?: string | null;
}

export interface UpdateTenantData {
  name?: string;
  domain?: string | null;
}

export class TenantStorage {
  private static instance: TenantStorage;
  private db!: Database;
  private dbPath: string;

  private constructor() {
    this.dbPath = PATHS.USERS_DB;
  }

  static getInstance(): TenantStorage {
    if (!TenantStorage.instance) {
      TenantStorage.instance = new TenantStorage();
    }
    return TenantStorage.instance;
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

    // Create tenants table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        domain TEXT UNIQUE,
        has_logo INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Add has_logo column if it doesn't exist (for existing databases)
    try {
      this.db.run(`ALTER TABLE tenants ADD COLUMN has_logo INTEGER NOT NULL DEFAULT 0`);
    } catch (error: any) {
      // Column already exists, ignore error
      if (!error.message?.includes('duplicate column name')) {
        throw error;
      }
    }

    // Create indexes
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain)');

    console.log('[TenantStorage] Database initialized at', this.dbPath);
  }

  /**
   * Create a new tenant
   */
  async create(data: CreateTenantData): Promise<Tenant> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO tenants (name, domain, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(data.name, data.domain || null, now, now);
      const tenant = this.getById(result.lastInsertRowid as number);

      if (!tenant) {
        throw new Error('Failed to create tenant');
      }

      console.log('[TenantStorage] Created tenant:', tenant.name);
      return tenant;
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        throw new Error('Domain already exists');
      }
      throw error;
    }
  }

  /**
   * Get tenant by ID
   */
  getById(id: number): Tenant | null {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE id = ?');
    return stmt.get(id) as Tenant | null;
  }

  /**
   * Get tenant by domain
   */
  getByDomain(domain: string): Tenant | null {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE domain = ?');
    return stmt.get(domain) as Tenant | null;
  }

  /**
   * Get all tenants
   */
  getAll(): Tenant[] {
    const stmt = this.db.prepare('SELECT * FROM tenants ORDER BY created_at DESC');
    return stmt.all() as Tenant[];
  }

  /**
   * Update tenant
   */
  async update(id: number, data: UpdateTenantData): Promise<Tenant | null> {
    const tenant = this.getById(id);
    if (!tenant) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.domain !== undefined) {
      updates.push('domain = ?');
      values.push(data.domain || null);
    }

    if (updates.length === 0) {
      return tenant;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tenants SET ${updates.join(', ')} WHERE id = ?
    `);

    try {
      stmt.run(...values);
      return this.getById(id);
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        throw new Error('Domain already exists');
      }
      throw error;
    }
  }

  /**
   * Delete tenant
   */
  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM tenants WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Count total tenants
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM tenants');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Check if default tenant exists
   */
  hasDefaultTenant(): boolean {
    return this.count() > 0;
  }

  /**
   * Get tenant directory path
   */
  getTenantDir(tenantId: number): string {
    const dataDir = path.dirname(this.dbPath);
    return path.join(dataDir, 'tenants', tenantId.toString());
  }

  /**
   * Get tenant logo path
   */
  getTenantLogoPath(tenantId: number): string {
    return path.join(this.getTenantDir(tenantId), 'logo.png');
  }

  /**
   * Mark tenant as having a logo
   */
  async setHasLogo(tenantId: number, hasLogo: boolean): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE tenants SET has_logo = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(hasLogo ? 1 : 0, Date.now(), tenantId);
  }

  /**
   * Check if tenant logo exists
   */
  async checkLogoExists(tenantId: number): Promise<boolean> {
    const logoPath = this.getTenantLogoPath(tenantId);
    try {
      await fs.access(logoPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete tenant logo file
   */
  async deleteLogo(tenantId: number): Promise<void> {
    const logoPath = this.getTenantLogoPath(tenantId);
    try {
      await fs.unlink(logoPath);
      await this.setHasLogo(tenantId, false);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Ensure tenant directory exists
   */
  async ensureTenantDir(tenantId: number): Promise<void> {
    const tenantDir = this.getTenantDir(tenantId);
    await fs.mkdir(tenantDir, { recursive: true });
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
