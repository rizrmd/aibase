import { testConnection, getClient } from './connection';

async function main() {
  console.log('Testing database connection...');

  try {
    const isConnected = await testConnection();

    if (isConnected) {
      console.log('✅ Database connection successful!');

      // Try a simple query to verify
      const client = getClient();
      const result = await client`SELECT version()`;
      console.log('PostgreSQL version:', result[0]);
    } else {
      console.log('❌ Database connection failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error testing connection:', error);
    process.exit(1);
  }
}

main();
