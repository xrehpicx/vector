# AIKP - Issue Tracking Platform

A modern issue tracking platform built with Next.js and Convex.

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

## Features

- **Multi-tenant Organizations:** Isolated workspaces for teams
- **Project Management:** Create and manage projects with teams
- **Issue Tracking:** Full issue lifecycle with states, priorities, and assignments
- **Team Management:** Organize users into teams with roles
- **Custom Roles:** Flexible permission system
- **Real-time Updates:** Live data synchronization across clients

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
```

## Commands

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run convex:dev` - Start Convex development server
- `pnpm run lint` - Run ESLint

## Migration Status

This project has been migrated from a legacy stack (tRPC, Drizzle, Better-Auth, S3) to a modern Convex-only architecture. Legacy code has been archived in the `/archive` directory.
