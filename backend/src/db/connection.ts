import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import * as schema from './schema';

/**
 * Database connection configuration using Bun's native SQL driver
 *
 * Benefits:
 * - Zero dependencies (built into Bun runtime)
 * - Native performance with optimizations
 * - Automatic connection pooling
 * - Support for prepared statements and query pipelining
 */

/**
 * Bun SQL client instance
 * Singleton pattern to ensure single instance
 */
let sqlClient: SQL | null = null;

/**
 * Get or create the Bun SQL client
 */
export function getClient(): SQL {
  if (!sqlClient) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Please configure it in your .env file.'
      );
    }

    // Initialize Bun SQL client with connection pooling
    sqlClient = new SQL({
      url: connectionString,
      // Connection pool configuration
      max: 20, // Maximum number of connections
      idleTimeout: 30, // Close idle connections after 30 seconds
      connectionTimeout: 10, // Connection timeout in seconds
    });
  }

  return sqlClient;
}

/**
 * Drizzle database instance
 * Provides type-safe database queries using Bun's native SQL driver
 */
export const db = drizzle({ client: getClient(), schema });

/**
 * Close database connection
 * Call this when shutting down the application
 */
export async function closeConnection(): Promise<void> {
  if (sqlClient) {
    // Bun SQL client doesn't expose a close method
    // Connections are managed automatically
    sqlClient = null;
  }
}

/**
 * Test database connection
 * Useful for health checks and startup verification
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getClient();
    const result = await client`SELECT NOW() as now`;
    return result.length > 0;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Execute a raw SQL query using Bun's native tagged template
 * Use sparingly - prefer Drizzle ORM queries for type safety
 *
 * @example
 * const users = await executeRawQuery`SELECT * FROM users WHERE id = ${userId}`;
 */
export async function executeRawQuery<T = any>(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<T[]> {
  const client = getClient();
  // Reconstruct the tagged template call
  const query = String.raw({ raw: strings }, ...values);
  const result = await client`${query}`;
  return result as T[];
}
