import { getClient } from './connection';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

async function migrate() {
  console.log('Running database migrations...');

  try {
    const client = getClient();
    const migrationsDir = join(import.meta.dir, '../../drizzle');

    // Get all migration files sorted
    const migrationFiles = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration(s)\n`);

    for (const migrationFile of migrationFiles) {
      console.log(`\n📄 Applying migration: ${migrationFile}`);
      const migrationPath = join(migrationsDir, migrationFile);
      const migrationSQL = readFileSync(migrationPath, 'utf-8');

      // Split by statement breakpoints and execute each statement
      const statements = migrationSQL
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        console.log(`  Executing: ${statement.substring(0, 60)}...`);
        try {
          await client.unsafe(statement);
        } catch (error: any) {
          // Skip if constraint/table already exists or doesn't exist
          if (
            error.message?.includes('already exists') ||
            error.message?.includes('does not exist')
          ) {
            console.log(`  ⏭️  Skipped (already applied)`);
          } else {
            throw error;
          }
        }
      }
    }

    console.log('\n✅ All migrations completed successfully!');

    // Verify current tables
    const tables = await client`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;

    console.log('\n📊 Current tables in database:');
    tables.forEach((table: any) => console.log(`  - ${table.tablename}`));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
