# Convex Migration Documentation

> Historical reference only. This directory documents the earlier migration from legacy architecture to the current Convex-based stack. It should not be treated as the source of truth for current setup or contributor workflow.

> **Goal:** Migrate the AIKP code-base from Better-Auth + Drizzle/PostgreSQL + tRPC + S3 **to** Convex Auth + Convex Database + Convex Functions + Convex Storage **without altering any UI/UX or visual design**.

## Overview

This migration is organized into phases, each with its own documentation file. Each phase builds upon the previous one, ensuring a systematic and controlled migration process.

## Migration Phases

### [Phase 0: Preparation](./00-preparation.md) ✅ COMPLETE

- Research Convex patterns and best practices
- Map current implementation (Better-Auth, tRPC, Drizzle schema)
- Document existing architecture and data flows

### [Phase 1: Bootstrap Convex](./01-bootstrap-convex.md) ✅ COMPLETE

- Initialize Convex project with local development
- Configure TypeScript and development environment
- Set up basic schema foundation

### [Phase 2: Authentication](./02-authentication.md) ✅ COMPLETE

- Implement Convex Auth with password provider
- Migrate from Better-Auth to Convex Auth
- Set up authentication flows and session management

### [Phase 3: Database & Schema](./03-database-schema.md) ✅ COMPLETE

- Design comprehensive Convex schema
- Map all PostgreSQL tables to Convex collections
- Implement multi-tenant patterns and indexes

### [Phase 4: Business Logic & API](./04-business-logic-api.md) 🔄 IN PROGRESS

- Map tRPC routers to Convex functions
- Implement CRUD operations for all domains
- Add advanced features (pagination, filtering, permissions)

### [Phase 5: File Storage](./05-file-storage.md) ❌ PENDING

- Migrate from S3 to Convex Storage
- Update file upload/download patterns
- Handle existing file migration

### [Phase 6: Middleware & Permissions](./06-middleware-permissions.md) ❌ PENDING

- Port permission system to Convex
- Update middleware and access controls
- Implement role-based access control

### [Phase 7: Decommission Legacy](./07-decommission-legacy.md) ❌ PENDING

- Remove legacy dependencies and code
- Clean up environment variables
- Archive old infrastructure

## Best Practices

### [Convex Organization Patterns](./convex-organization-patterns.md)

- Folder structure best practices
- File naming conventions
- Code organization guidelines

### [Convex Function Patterns](./convex-function-patterns.md)

- Query, mutation, and action patterns
- Type safety guidelines
- Error handling best practices

## Current Status

- **Completed:** Phases 0-3 (Foundation, Auth, Schema)
- **In Progress:** Phase 4 (Business Logic & API)
- **Pending:** Phases 5-7 (Storage, Permissions, Cleanup)

## Key Requirements

- **Local Development Only:** Use local Convex instance, no cloud account creation
- **TypeScript Best Practices:** Avoid `any` types, `!` assertions, and type workarounds
- **Schema-Driven Types:** Infer types from database schema, avoid duplicate type declarations
- **Research First:** Google and verify Convex implementation patterns before starting any changes

## Quick Start

1. Read the [current phase documentation](./04-business-logic-api.md)
2. Check the [Convex organization patterns](./convex-organization-patterns.md) for folder structure
3. Follow the [Convex function patterns](./convex-function-patterns.md) for implementation
4. Update checkboxes in phase files as tasks are completed

## Legend

- `🗂 file` – reference to an existing project file
- `📦 pkg` – pnpm dependency
- `📓 note` – important caveat
- ✅ – Complete
- 🔄 – In Progress
- ❌ – Pending
