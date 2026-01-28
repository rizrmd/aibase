/**
 * Session storage service using SQLite
 * Stores sessions in data/app/databases/users.db (same database as users)
 */

import { Database } from "bun:sqlite";
import * as path from 'path';
import * as crypto from 'crypto';
import { PATHS } from '../config/paths';

export interface Session {
  id: number;
  token: string;
  user_id: number;
  created_at: number;
  expires_at: number;
  last_accessed_at: number;
}

export class SessionStorage {
  private static instance: SessionStorage;
  private db!: Database;
  private dbPath: string;

  // Default session duration: 7 days
  private readonly SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

  private constructor() {
    this.dbPath = PATHS.USERS_DB;
  }

  static getInstance(): SessionStorage {
    if (!SessionStorage.instance) {
      SessionStorage.instance = new SessionStorage();
    }
    return SessionStorage.instance;
  }

  /**
   * Initialize the database and create tables
   */
  async initialize(): Promise<void> {
    // Open database (should already exist from UserStorage)
    this.db = new Database(this.dbPath);

    // Create sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for faster lookups
    this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');

    console.log('[SessionStorage] Database initialized');
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new session for a user
   */
  async create(userId: number): Promise<Session> {
    const now = Date.now();
    const token = this.generateToken();
    const expiresAt = now + this.SESSION_DURATION;

    const stmt = this.db.prepare(`
      INSERT INTO sessions (token, user_id, created_at, expires_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(token, userId, now, expiresAt, now);
    const session = this.getById(result.lastInsertRowid as number);

    if (!session) {
      throw new Error('Failed to create session');
    }

    console.log('[SessionStorage] Created session for user ID:', userId);
    return session;
  }

  /**
   * Get session by ID
   */
  getById(id: number): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as Session | null;
  }

  /**
   * Get session by token
   */
  getByToken(token: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE token = ?');
    const session = stmt.get(token) as Session | null;

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expires_at < Date.now()) {
      this.delete(session.id);
      return null;
    }

    return session;
  }

  /**
   * Get all sessions for a user
   */
  getByUserId(userId: number): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ?');
    return stmt.all(userId, Date.now()) as Session[];
  }

  /**
   * Update last accessed time for a session
   */
  async updateLastAccessed(sessionId: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE sessions SET last_accessed_at = ? WHERE id = ?
    `);
    stmt.run(Date.now(), sessionId);
  }

  /**
   * Extend session expiration
   */
  async extend(sessionId: number): Promise<Session | null> {
    const now = Date.now();
    const expiresAt = now + this.SESSION_DURATION;

    const stmt = this.db.prepare(`
      UPDATE sessions SET expires_at = ?, last_accessed_at = ? WHERE id = ?
    `);
    stmt.run(expiresAt, now, sessionId);

    return this.getById(sessionId);
  }

  /**
   * Delete a session (logout)
   */
  async delete(sessionId: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  /**
   * Delete a session by token
   */
  async deleteByToken(token: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE token = ?');
    const result = stmt.run(token);
    return result.changes > 0;
  }

  /**
   * Delete all sessions for a user
   */
  async deleteAllForUser(userId: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE user_id = ?');
    const result = stmt.run(userId);
    return result.changes;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE expires_at < ?');
    const result = stmt.run(Date.now());
    const deletedCount = result.changes;

    if (deletedCount > 0) {
      console.log('[SessionStorage] Cleaned up', deletedCount, 'expired sessions');
    }

    return deletedCount;
  }

  /**
   * Validate and refresh a session
   * Returns the session if valid, null otherwise
   */
  async validateAndRefresh(token: string): Promise<Session | null> {
    const session = this.getByToken(token);

    if (!session) {
      return null;
    }

    // Update last accessed time
    await this.updateLastAccessed(session.id);

    // Optionally extend session if it's been more than 1 day since creation
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    if (session.last_accessed_at < oneDayAgo) {
      return await this.extend(session.id);
    }

    return session;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
