#!/usr/bin/env bun
/**
 * Create the first root user
 * Usage: bun run backend/src/scripts/create-root-user.ts <email> <username> <password>
 */

import { UserStorage } from '../storage/user-storage';

async function createRootUser(email: string, username: string, password: string) {
  const userStorage = UserStorage.getInstance();
  await userStorage.initialize();

  // Check if root user already exists
  if (userStorage.hasRootUser()) {
    console.error('Error: A root user already exists');
    process.exit(1);
  }

  // Hash password
  const passwordHash = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  // Create root user
  try {
    const user = await userStorage.create({
      email,
      username,
      password_hash: passwordHash,
      role: 'root',
      tenant_id: null,
    });

    console.log('Root user created successfully!');
    console.log('Email:', user.email);
    console.log('Username:', user.username);
    console.log('Role:', user.role);
    console.log('\nYou can now login with these credentials.');
  } catch (error: any) {
    console.error('Error creating root user:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

// Parse command line arguments
const [email, username, password] = process.argv.slice(2);

if (!email || !username || !password) {
  console.error('Usage: bun run backend/src/scripts/create-root-user.ts <email> <username> <password>');
  console.error('Example: bun run backend/src/scripts/create-root-user.ts admin@example.com admin MySecurePassword123');
  process.exit(1);
}

createRootUser(email, username, password);
