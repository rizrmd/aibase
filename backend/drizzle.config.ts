import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for database migrations
 *
 * Usage:
 * - Generate migrations: bun drizzle-kit generate
 * - Push to database: bun drizzle-kit push
 * - Open Drizzle Studio: bun drizzle-kit studio
 */
export default {
  // Path to schema file(s)
  schema: './src/db/schema.ts',

  // Output directory for migrations
  out: './drizzle',

  // Database dialect
  dialect: 'postgresql',

  // Database connection
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/aibase',
  },

  // Additional options
  verbose: true,
  strict: true,
} satisfies Config;
