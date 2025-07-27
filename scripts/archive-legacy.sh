#!/bin/bash

echo "Creating archive directory..."
mkdir -p archive

echo "Archiving legacy auth..."
mkdir -p archive/legacy-auth
mv src/auth/* archive/legacy-auth/ 2>/dev/null || echo "No legacy auth files found"

echo "Archiving legacy API..."
mkdir -p archive/legacy-api
mv src/trpc/* archive/legacy-api/ 2>/dev/null || echo "No legacy API files found"

echo "Archiving legacy database..."
mkdir -p archive/legacy-database
mv src/db/* archive/legacy-database/ 2>/dev/null || echo "No legacy database files found"

echo "Archiving legacy storage..."
mkdir -p archive/legacy-storage
mv src/lib/s3.ts archive/legacy-storage/ 2>/dev/null || echo "No legacy storage files found"
mv src/app/api/* archive/legacy-storage/api-routes/ 2>/dev/null || echo "No legacy API routes found"

echo "Archiving legacy migrations..."
mkdir -p archive/legacy-migrations
mv drizzle/* archive/legacy-migrations/ 2>/dev/null || echo "No legacy migrations found"
mv drizzle.config.ts archive/legacy-migrations/ 2>/dev/null || echo "No drizzle config found"

echo "Archiving legacy entities..."
mkdir -p archive/legacy-entities
mv src/entities/* archive/legacy-entities/ 2>/dev/null || echo "No legacy entities found"

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
- \`legacy-entities/\` - Service layer entities

## Migration Notes

- Migrated to Convex Auth (Phase 2)
- Migrated to Convex Functions (Phase 4)
- Migrated to Convex Database (Phase 3)
- Migrated to Convex Storage (Phase 5)

## Reference

This code is kept for reference and rollback purposes.
EOF

echo "Archive complete!" 