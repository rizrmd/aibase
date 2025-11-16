import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Database connection configuration using PostgreSQL
 *
 * Benefits:
 * - Robust connection pooling
 * - Production-ready PostgreSQL driver
 * - Type-safe queries with Drizzle ORM
 */

/**
 * PostgreSQL connection pool instance
 * Singleton pattern to ensure single instance
 */
let pool: Pool | null = null;

/**
 * Get or create PostgreSQL connection pool
 */
export function getClient(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Please configure it in your .env file.'
      );
    }

    // Initialize PostgreSQL connection pool
    pool = new Pool({
      connectionString,
      max: 20, // Maximum number of connections
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // Connection timeout in milliseconds
    });
  }

  return pool;
}

/**
 * Drizzle database instance
 * Provides type-safe database queries using PostgreSQL
 * Lazy initialization - only connects when actually used
 */
export function getDb() {
  return drizzle({ client: getClient(), schema });
}

/**
 * Close database connection
 * Call this when shutting down the application
 */
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Test database connection
 * Useful for health checks and startup verification
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getClient();
    const result = await client.query('SELECT NOW() as now');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Execute a raw SQL query using PostgreSQL
 * Use sparingly - prefer Drizzle ORM queries for type safety
 *
 * @example
 * const users = await executeRawQuery('SELECT * FROM users WHERE id = $1', [userId]);
 */
export async function executeRawQuery<T = any>(
  query: string,
  values: any[] = []
): Promise<T[]> {
  const client = getClient();
  const result = await client.query(query, values);
  return result.rows as T[];
}