# Phase 7: Decommission Legacy

## Overview

This phase removes legacy dependencies and code, cleans up environment variables, and archives old infrastructure after successful migration.

## Implementation Tasks

| #   | Task                                                                                                 | Status |
| --- | ---------------------------------------------------------------------------------------------------- | ------ |
| 7.1 | **Remove legacy dependencies** – Remove Better-Auth, tRPC, Drizzle, S3, and PostgreSQL dependencies. | ❌     |
| 7.2 | **Clean up environment variables** – Remove unused env vars and update documentation.                | ❌     |
| 7.3 | **Archive legacy code** – Move old files to archive folder for reference.                            | ❌     |
| 7.4 | **Update documentation** – Update README, setup guides, and deployment docs.                         | ❌     |
| 7.5 | **Test complete system** – Verify everything works without legacy dependencies.                      | ❌     |
| 7.6 | **Performance optimization** – Optimize for Convex-only architecture.                                | ❌     |

## Current Status: ❌ PENDING

### 7.1 Remove Legacy Dependencies ❌

**Dependencies to Remove:**

```json
// package.json - Remove these dependencies
{
  "dependencies": {
    "@auth/drizzle-adapter": "REMOVE",
    "@auth/core": "REMOVE",
    "@auth/nextjs": "REMOVE",
    "@aws-sdk/client-s3": "REMOVE",
    "@aws-sdk/s3-request-presigner": "REMOVE",
    "@trpc/client": "REMOVE",
    "@trpc/next": "REMOVE",
    "@trpc/react-query": "REMOVE",
    "@trpc/server": "REMOVE",
    "drizzle-orm": "REMOVE",
    "postgres": "REMOVE",
    "zod": "REMOVE" // If not used elsewhere
  },
  "devDependencies": {
    "drizzle-kit": "REMOVE",
    "@types/pg": "REMOVE"
  }
}
```

**Files to Remove:**

```
/src/
├── auth/                    # REMOVE - Better-Auth
├── trpc/                    # REMOVE - tRPC
├── db/                      # REMOVE - Drizzle
├── lib/s3.ts               # REMOVE - S3
└── app/api/                # REMOVE - API routes
    ├── auth/
    ├── files/
    ├── orgs/
    ├── system/
    └── trpc/

/drizzle/                    # REMOVE - Drizzle migrations
docker-compose.dev.yml       # REMOVE - PostgreSQL
```

### 7.2 Clean Up Environment Variables ❌

**Environment Variables to Remove:**

```bash
# .env.local - Remove these variables
# Legacy Auth
AUTH_SECRET=REMOVE
AUTH_URL=REMOVE

# Legacy Database
DATABASE_URL=REMOVE
POSTGRES_DB=REMOVE
POSTGRES_USER=REMOVE
POSTGRES_PASSWORD=REMOVE

# Legacy S3
AWS_REGION=REMOVE
AWS_ACCESS_KEY_ID=REMOVE
AWS_SECRET_ACCESS_KEY=REMOVE
S3_BUCKET=REMOVE
S3_ENDPOINT=REMOVE
S3_FORCE_PATH_STYLE=REMOVE

# Legacy tRPC
NEXTAUTH_SECRET=REMOVE
NEXTAUTH_URL=REMOVE
```

**Environment Variables to Keep:**

```bash
# .env.local - Keep these variables
# Convex
CONVEX_DEPLOYMENT=anonymous:anonymous-aikp

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 7.3 Archive Legacy Code ❌

**Archive Structure:**

```
/archive/
├── legacy-auth/             # Better-Auth implementation
│   ├── auth.ts
│   ├── builtin-role-permissions.ts
│   ├── permission-constants.ts
│   ├── permissions.ts
│   └── policy-engine.ts
├── legacy-api/              # tRPC implementation
│   ├── init.ts
│   ├── permissions.ts
│   └── routers/
│       ├── _app.ts
│       ├── issue.router.ts
│       ├── organization.router.ts
│       ├── project.router.ts
│       ├── role.router.ts
│       ├── team.router.ts
│       └── user.router.ts
├── legacy-database/         # Drizzle implementation
│   ├── index.ts
│   └── schema/
│       ├── index.ts
│       ├── issue-config.ts
│       ├── issues.ts
│       ├── org-roles.ts
│       ├── projects.ts
│       ├── teams.ts
│       └── users-and-auth.ts
├── legacy-storage/          # S3 implementation
│   ├── s3.ts
│   └── api-routes/
│       └── files/
├── legacy-migrations/       # Drizzle migrations
│   ├── drizzle/
│   └── drizzle.config.ts
└── README.md               # Archive documentation
```

**Archive Script:**

```bash
#!/bin/bash
# archive-legacy.sh

echo "Creating archive directory..."
mkdir -p archive

echo "Archiving legacy auth..."
mkdir -p archive/legacy-auth
mv src/auth/* archive/legacy-auth/

echo "Archiving legacy API..."
mkdir -p archive/legacy-api
mv src/trpc/* archive/legacy-api/

echo "Archiving legacy database..."
mkdir -p archive/legacy-database
mv src/db/* archive/legacy-database/

echo "Archiving legacy storage..."
mkdir -p archive/legacy-storage
mv src/lib/s3.ts archive/legacy-storage/
mv src/app/api/* archive/legacy-storage/api-routes/

echo "Archiving legacy migrations..."
mkdir -p archive/legacy-migrations
mv drizzle/* archive/legacy-migrations/
mv drizzle.config.ts archive/legacy-migrations/

echo "Creating archive README..."
cat > archive/README.md << EOF
# Legacy Code Archive

This directory contains the original implementation before migration to Convex.

## Contents

- \`legacy-auth/\` - Better-Auth implementation
- \`legacy-api/\` - tRPC API implementation
- \`legacy-database/\` - Drizzle database implementation
- \`legacy-storage/\` - S3 file storage implementation
- \`legacy-migrations/\` - Drizzle database migrations

## Migration Notes

- Migrated to Convex Auth (Phase 2)
- Migrated to Convex Functions (Phase 4)
- Migrated to Convex Database (Phase 3)
- Migrated to Convex Storage (Phase 5)

## Reference

This code is kept for reference and rollback purposes.
EOF

echo "Archive complete!"
```

### 7.4 Update Documentation ❌

**README.md Updates:**

````markdown
# AIKP - Issue Tracking Platform

## Tech Stack

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Backend:** Convex (Database, Functions, Auth, Storage)
- **UI Components:** shadcn/ui
- **Development:** Local Convex instance

## Quick Start

1. **Clone and install:**
   ```bash
   git clone <repo>
   cd aikp
   pnpm install
   ```
````

2. **Start development:**

   ```bash
   pnpm run dev
   ```

3. **Access the app:**
   - App: http://localhost:3000
   - Convex Dashboard: http://127.0.0.1:6790/?d=anonymous-aikp

## Architecture

- **Convex Database:** Document-based with multi-tenant design
- **Convex Functions:** Type-safe queries, mutations, and actions
- **Convex Auth:** Built-in authentication with password provider
- **Convex Storage:** File upload/download with organization scoping
- **Real-time:** Automatic subscriptions and live updates

## Development

- **Local Development:** Uses local Convex instance (no cloud account needed)
- **Type Safety:** Full TypeScript integration with schema-driven types
- **Hot Reload:** Automatic function updates during development
- **Dashboard:** Real-time monitoring and debugging capabilities

````

**Setup Guide Updates:**

```markdown
# Local Development Setup

## Prerequisites

- Node.js 18+
- pnpm package manager
- No cloud accounts required

## Installation

1. **Install dependencies:**
   ```bash
   pnpm install
````

2. **Start Convex development:**

   ```bash
   pnpm run convex:dev
   ```

3. **Start Next.js development:**
   ```bash
   pnpm run dev
   ```

## Environment Variables

Create `.env.local`:

```bash
CONVEX_DEPLOYMENT=anonymous:anonymous-aikp
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Access Points

- **Application:** http://localhost:3000
- **Convex Dashboard:** http://127.0.0.1:6790/?d=anonymous-aikp
- **Convex API:** http://127.0.0.1:3210

```

### 7.5 Test Complete System ❌

**Comprehensive Testing Checklist:**

- [ ] **Authentication:** Signup, login, logout, session management
- [ ] **User Management:** Profile updates, admin bootstrap
- [ ] **Organization Management:** Create, update, member management
- [ ] **Project Management:** CRUD operations, team assignments
- [ ] **Team Management:** Team creation, member management
- [ ] **Issue Tracking:** Create, update, assign, filter, search
- [ ] **Role Management:** Custom roles, permissions, assignments
- [ ] **File Storage:** Upload, download, access controls
- [ ] **Real-time Updates:** Live data synchronization
- [ ] **Permission System:** Access controls, role-based permissions
- [ ] **Performance:** Query performance, real-time subscriptions
- [ ] **Error Handling:** Graceful error handling and user feedback

**Performance Testing:**

- [ ] **Query Performance:** All queries under 100ms
- [ ] **Real-time Updates:** Sub 50ms update latency
- [ ] **File Operations:** Upload/download performance
- [ ] **Concurrent Users:** Multi-user testing
- [ ] **Data Volume:** Large dataset performance

### 7.6 Performance Optimization ❌

**Optimization Areas:**

1. **Query Optimization:**
   - Ensure all queries use proper indexes
   - Optimize pagination for large datasets
   - Implement efficient filtering patterns

2. **Real-time Optimization:**
   - Optimize subscription patterns
   - Reduce unnecessary re-renders
   - Implement efficient caching

3. **File Storage Optimization:**
   - Optimize upload/download patterns
   - Implement proper file access controls
   - Monitor storage usage

4. **Frontend Optimization:**
   - Optimize bundle size
   - Implement efficient data fetching
   - Reduce unnecessary API calls

## Implementation Strategy

### Phase 7.1: Dependency Removal ❌
- [ ] Remove Better-Auth dependencies
- [ ] Remove tRPC dependencies
- [ ] Remove Drizzle dependencies
- [ ] Remove S3 dependencies
- [ ] Update package.json

### Phase 7.2: Environment Cleanup ❌
- [ ] Remove unused environment variables
- [ ] Update environment documentation
- [ ] Clean up .env files
- [ ] Update deployment scripts

### Phase 7.3: Code Archival ❌
- [ ] Create archive directory structure
- [ ] Move legacy code to archive
- [ ] Create archive documentation
- [ ] Update .gitignore

### Phase 7.4: Documentation Updates ❌
- [ ] Update README.md
- [ ] Update setup guides
- [ ] Update deployment documentation
- [ ] Update architecture documentation

### Phase 7.5: System Testing ❌
- [ ] Comprehensive functionality testing
- [ ] Performance testing
- [ ] Security testing
- [ ] User acceptance testing

### Phase 7.6: Performance Optimization ❌
- [ ] Query optimization
- [ ] Real-time optimization
- [ ] Frontend optimization
- [ ] File storage optimization

## Migration Benefits

### 1. **Simplified Architecture**
- Single backend provider (Convex)
- Reduced dependencies
- Unified development experience
- Simplified deployment

### 2. **Better Performance**
- Optimized for Convex architecture
- Reduced bundle size
- Faster development cycles
- Better real-time performance

### 3. **Reduced Maintenance**
- Fewer dependencies to maintain
- Simplified security model
- Unified error handling
- Easier debugging

## Next Steps

1. **Remove legacy dependencies** (Phase 7.1)
2. **Clean up environment** (Phase 7.2)
3. **Archive legacy code** (Phase 7.3)
4. **Update documentation** (Phase 7.4)
5. **Comprehensive testing** (Phase 7.5)
6. **Performance optimization** (Phase 7.6)

The decommission phase will complete the migration by removing all legacy code and optimizing the new Convex-only architecture.
```
