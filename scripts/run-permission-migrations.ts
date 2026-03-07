#!/usr/bin/env tsx

/**
 * Script to run permission system migrations
 *
 * This script should be run after deploying the unified permission system
 * to backfill system roles, scoped role assignments, and legacy custom roles.
 */

import { spawn } from 'node:child_process';

// You'll need to set this to your Convex deployment URL
const CONVEX_URL = process.env.CONVEX_URL || 'http://localhost:8000';

async function runMigrations() {
  console.log('🚀 Starting permission system migrations...');

  const adminKey = process.env.CONVEX_ADMIN_KEY;

  if (!adminKey) {
    throw new Error('CONVEX_ADMIN_KEY is required to run internal migrations');
  }

  try {
    console.log(
      '📋 Migrating unified roles, assignments, and legacy custom roles...',
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'pnpm',
        [
          'convex',
          'run',
          'internal.migrations.index.migrateUnifiedRoles',
          '{}',
          '--url',
          CONVEX_URL,
          '--admin-key',
          adminKey,
          '--typecheck',
          'disable',
          '--codegen',
          'disable',
        ],
        {
          stdio: 'inherit',
          env: process.env,
        },
      );

      child.on('error', reject);
      child.on('exit', code => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(`Migration command failed with exit code ${code ?? 1}`),
        );
      });
    });
    console.log('✅ Migration finished successfully');

    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

export { runMigrations };
