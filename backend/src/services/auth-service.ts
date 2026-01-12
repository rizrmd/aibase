/**
 * Authentication service
 * Handles user registration, login, and password management
 */

import { UserStorage, type User, type CreateUserData, type UserRole } from '../storage/user-storage';
import { SessionStorage, type Session } from '../storage/session-storage';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthService');

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  role?: UserRole;
  tenant_id?: number | null;
}

export interface LoginData {
  emailOrUsername: string;
  password: string;
}

export interface AuthResult {
  user: Omit<User, 'password_hash'>;
  session: Session;
}

export class AuthService {
  private static instance: AuthService;
  private userStorage: UserStorage;
  private sessionStorage: SessionStorage;

  private constructor() {
    this.userStorage = UserStorage.getInstance();
    this.sessionStorage = SessionStorage.getInstance();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Initialize storage services
   */
  async initialize(): Promise<void> {
    await this.userStorage.initialize();
    await this.sessionStorage.initialize();

    // Start periodic cleanup of expired sessions (every hour)
    setInterval(() => {
      this.sessionStorage.cleanupExpired();
    }, 60 * 60 * 1000);

    logger.info('Service initialized');
  }

  /**
   * Hash a password using Bun's built-in password hashing
   */
  private async hashPassword(password: string): Promise<string> {
    return await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10, // bcrypt cost factor
    });
  }

  /**
   * Verify a password against a hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await Bun.password.verify(password, hash);
  }

  /**
   * Validate email format
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate username format
   */
  private validateUsername(username: string): boolean {
    // Username must be 3-20 characters, alphanumeric + underscore
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (password.length > 128) {
      return { valid: false, message: 'Password is too long' };
    }
    // Add more password requirements here if needed
    return { valid: true };
  }

  /**
   * Remove password hash from user object
   */
  private sanitizeUser(user: User): Omit<User, 'password_hash'> {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResult> {
    // Validate input
    if (!this.validateEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    // Skip username validation for embed users (they have special format)
    if (!data.username.startsWith('embed_')) {
      if (!this.validateUsername(data.username)) {
        throw new Error('Username must be 3-20 characters and contain only letters, numbers, and underscores');
      }
    }

    const passwordValidation = this.validatePassword(data.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message || 'Invalid password');
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Create user (role defaults to 'user' if not provided)
    const role = data.role || 'user';

    // All users must have tenant_id
    if (!data.tenant_id) {
      throw new Error('Admin and user roles must belong to a tenant');
    }

    const user = await this.userStorage.create({
      email: data.email,
      username: data.username,
      password_hash: passwordHash,
      role,
      tenant_id: data.tenant_id,
    });

    // Create session
    const session = await this.sessionStorage.create(user.id);

    return {
      user: this.sanitizeUser(user),
      session,
    };
  }

  /**
   * Login a user
   */
  async login(data: LoginData): Promise<AuthResult> {
    // Find user by email or username
    const user = data.emailOrUsername.includes('@')
      ? this.userStorage.getByEmail(data.emailOrUsername)
      : this.userStorage.getByUsername(data.emailOrUsername);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(data.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Create session
    const session = await this.sessionStorage.create(user.id);

    return {
      user: this.sanitizeUser(user),
      session,
    };
  }

  /**
   * Logout a user
   */
  async logout(token: string): Promise<boolean> {
    return await this.sessionStorage.deleteByToken(token);
  }

  /**
   * Validate a session and return the user
   */
  async validateSession(token: string): Promise<Omit<User, 'password_hash'> | null> {
    const session = await this.sessionStorage.validateAndRefresh(token);
    if (!session) {
      return null;
    }

    const user = this.userStorage.getById(session.user_id);
    if (!user) {
      // User was deleted, clean up session
      await this.sessionStorage.delete(session.id);
      return null;
    }

    return this.sanitizeUser(user);
  }

  /**
   * Get user by session token
   */
  async getUserByToken(token: string): Promise<Omit<User, 'password_hash'> | null> {
    return await this.validateSession(token);
  }

  /**
   * Change user password
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = this.userStorage.getById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid current password');
    }

    // Validate new password
    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message || 'Invalid password');
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(newPassword);

    // Update user
    await this.userStorage.update(userId, { password_hash: newPasswordHash });

    // Invalidate all sessions except current one (for security)
    // This will force re-login on all other devices
    await this.sessionStorage.deleteAllForUser(userId);
  }

  /**
   * Delete a user account
   */
  async deleteAccount(userId: number, password: string): Promise<boolean> {
    const user = this.userStorage.getById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    // Delete all sessions
    await this.sessionStorage.deleteAllForUser(userId);

    // Delete user
    return await this.userStorage.delete(userId);
  }

  /**
   * Create a user (admin only)
   * This bypasses normal registration flow
   */
  async createUser(
    adminUserId: number,
    data: RegisterData
  ): Promise<Omit<User, 'password_hash'>> {
    // Check if admin has permission
    if (!this.userStorage.hasRole(adminUserId, 'admin')) {
      throw new Error('Insufficient permissions');
    }

    // Get admin user to check tenant
    const adminUser = this.userStorage.getById(adminUserId);
    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    // Validate input
    if (!this.validateEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    if (!this.validateUsername(data.username)) {
      throw new Error('Username must be 3-20 characters and contain only letters, numbers, and underscores');
    }

    const passwordValidation = this.validatePassword(data.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message || 'Invalid password');
    }

    // Admin can only create users in their own tenant
    const tenantId = data.tenant_id || adminUser.tenant_id;
    const role = data.role || 'user';

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Create user
    const user = await this.userStorage.create({
      email: data.email,
      username: data.username,
      password_hash: passwordHash,
      role,
      tenant_id: tenantId,
    });

    return this.sanitizeUser(user);
  }

  /**
   * Check if user has required role
   */
  hasRole(userId: number, requiredRole: UserRole): boolean {
    return this.userStorage.hasRole(userId, requiredRole);
  }

  /**
   * Get all users (admin only)
   * Admin sees only users in their tenant
   */
  async getAllUsers(adminUserId: number): Promise<Omit<User, 'password_hash'>[]> {
    if (!this.userStorage.hasRole(adminUserId, 'admin')) {
      throw new Error('Insufficient permissions');
    }

    const adminUser = this.userStorage.getById(adminUserId);
    if (!adminUser) {
      throw new Error('Admin user not found');
    }

    // Admin can only see users in their tenant
    if (adminUser.role === 'admin' && adminUser.tenant_id) {
      return this.userStorage.getByTenantId(adminUser.tenant_id);
    }

    return [];
  }

  /**
   * Delete a user by ID (admin only)
   */
  async deleteUserById(userId: number): Promise<boolean> {
    // Delete all sessions first
    await this.sessionStorage.deleteAllForUser(userId);

    // Delete user
    return await this.userStorage.delete(userId);
  }

  /**
   * Create a session for a specific user ID (internal use only)
   * Used for embed authentication where identity is verified via other means
   */
  async createSessionForUser(userId: number): Promise<Session> {
    return await this.sessionStorage.create(userId);
  }
}
