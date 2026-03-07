#!/usr/bin/env tsx

/**
 * Script to run permission system migrations
 *
 * This script should be run after deploying the new permission system
 * to set up default roles for existing teams and projects.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

// You'll need to set this to your Convex deployment URL
const CONVEX_URL = process.env.CONVEX_URL || 'http://localhost:8000';

async function runMigrations() {
  console.log('🚀 Starting permission system migrations...');

  const client = new ConvexHttpClient(CONVEX_URL);

  try {
    // Step 1: Create default roles for existing teams and projects
    console.log(
      '📋 Step 1: Creating default roles for existing teams and projects...'
    );
    const defaultRolesResult = await client.mutation(
      api.migrations.index.migrateDefaultRoles,
      {}
    );
    console.log('✅ Default roles created:', defaultRolesResult.message);

    // Step 2: Assign existing team members to Member roles
    console.log(
      '👥 Step 2: Assigning existing team members to Member roles...'
    );
    const teamMembersResult = await client.mutation(
      api.migrations.index.migrateTeamMembers,
      {}
    );
    console.log('✅ Team members assigned:', teamMembersResult.message);

    // Step 3: Assign existing project members to Member roles
    console.log(
      '👥 Step 3: Assigning existing project members to Member roles...'
    );
    const projectMembersResult = await client.mutation(
      api.migrations.index.migrateProjectMembers,
      {}
    );
    console.log('✅ Project members assigned:', projectMembersResult.message);

    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

export { runMigrations };
