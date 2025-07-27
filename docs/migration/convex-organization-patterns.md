# Convex Organization Patterns

This document outlines the recommended folder structure and organization patterns for Convex projects, based on research and best practices.

## Recommended Folder Structure

```
/convex/
├── _generated/              # Auto-generated TypeScript definitions (DO NOT EDIT)
├── _shared/                 # Shared utilities and helpers
│   ├── auth.ts             # Authentication helpers
│   ├── pagination.ts       # Pagination utilities
│   ├── validation.ts       # Validation helpers
│   ├── permissions.ts      # Permission checking logic
│   └── filters.ts          # Filtering and search utilities
├── actions/                 # External side effects (emails, webhooks, etc.)
│   ├── notifications.ts    # Email notifications
│   ├── files.ts           # File upload/download handling
│   └── webhooks.ts        # External integrations
├── auth/                   # Authentication-specific functions
│   ├── auth.ts            # Main auth configuration
│   ├── http.ts            # HTTP router for auth endpoints
│   └── users.ts           # User management functions
├── organizations/          # Organization domain
│   ├── queries.ts         # Organization queries
│   ├── mutations.ts       # Organization mutations
│   └── actions.ts         # Organization-specific actions
├── projects/              # Project domain
│   ├── queries.ts         # Project queries
│   ├── mutations.ts       # Project mutations
│   └── actions.ts         # Project-specific actions
├── teams/                 # Team domain
│   ├── queries.ts         # Team queries
│   ├── mutations.ts       # Team mutations
│   └── actions.ts         # Team-specific actions
├── issues/                # Issue domain
│   ├── queries.ts         # Issue queries
│   ├── mutations.ts       # Issue mutations
│   └── actions.ts         # Issue-specific actions
├── roles/                 # Role management domain
│   ├── queries.ts         # Role queries
│   ├── mutations.ts       # Role mutations
│   └── actions.ts         # Role-specific actions
├── users/                 # User management domain
│   ├── queries.ts         # User queries
│   ├── mutations.ts       # User mutations
│   └── actions.ts         # User-specific actions
├── schema.ts              # Database schema definition
└── hello.ts               # Example/test function
```

## Organization Principles

### 1. **Domain-Driven Structure**

- Group files by business domain (organizations, projects, teams, issues, etc.)
- Each domain has its own folder with clear separation of concerns
- Mirror the structure of your frontend components and business logic

### 2. **Function Type Separation**

Within each domain folder, separate functions by type:

- `queries.ts` - Read-only operations (`query` functions)
- `mutations.ts` - Data modification operations (`mutation` functions)
- `actions.ts` - External side effects (`action` functions)

### 3. **Shared Utilities**

- `_shared/` folder contains reusable utilities across domains
- Common patterns like pagination, validation, permissions
- Avoid duplicating logic across domains

### 4. **External Side Effects**

- `actions/` folder for external integrations (emails, webhooks, file storage)
- Keep mutations pure by moving side effects to actions
- Clear separation between data operations and external calls

## File Naming Conventions

### Domain Folders

- Use plural nouns: `organizations/`, `projects/`, `teams/`, `issues/`
- Match your business domain terminology
- Keep names consistent with your frontend structure

### Function Files

- `queries.ts` - All query functions for the domain
- `mutations.ts` - All mutation functions for the domain
- `actions.ts` - All action functions for the domain

### Shared Files

- `auth.ts` - Authentication-related utilities
- `pagination.ts` - Pagination helpers
- `validation.ts` - Input validation utilities
- `permissions.ts` - Permission checking logic
- `filters.ts` - Search and filtering utilities

## Migration Strategy

### Current State → Recommended State

**Current (All files at root):**

```
/convex/
├── issues.ts
├── organizations.ts
├── projects.ts
├── teams.ts
├── roles.ts
├── users.ts
├── auth.ts
├── http.ts
├── schema.ts
└── _shared/
    ├── auth.ts
    ├── pagination.ts
    └── validation.ts
```

**Recommended (Domain-organized):**

```
/convex/
├── _shared/
│   ├── auth.ts
│   ├── pagination.ts
│   ├── validation.ts
│   ├── permissions.ts
│   └── filters.ts
├── auth/
│   ├── auth.ts
│   ├── http.ts
│   └── users.ts
├── organizations/
│   ├── queries.ts
│   ├── mutations.ts
│   └── actions.ts
├── projects/
│   ├── queries.ts
│   ├── mutations.ts
│   └── actions.ts
├── teams/
│   ├── queries.ts
│   ├── mutations.ts
│   └── actions.ts
├── issues/
│   ├── queries.ts
│   ├── mutations.ts
│   └── actions.ts
├── roles/
│   ├── queries.ts
│   ├── mutations.ts
│   └── actions.ts
├── users/
│   ├── queries.ts
│   ├── mutations.ts
│   └── actions.ts
├── actions/
│   ├── notifications.ts
│   ├── files.ts
│   └── webhooks.ts
├── schema.ts
└── hello.ts
```

## Implementation Steps

### Step 1: Create Domain Folders

```bash
mkdir -p convex/{auth,organizations,projects,teams,issues,roles,users,actions}
```

### Step 2: Move and Split Files

For each domain (e.g., `organizations.ts`):

1. Create `organizations/queries.ts` for query functions
2. Create `organizations/mutations.ts` for mutation functions
3. Create `organizations/actions.ts` for action functions
4. Move functions to appropriate files
5. Update imports in frontend code

### Step 3: Expand Shared Utilities

1. Add `_shared/permissions.ts` for permission checking
2. Add `_shared/filters.ts` for search and filtering
3. Consolidate common patterns across domains

### Step 4: Create Actions Folder

1. Move external side effects to `actions/` folder
2. Separate email notifications, file handling, webhooks
3. Keep mutations pure and focused on data operations

## Benefits of This Structure

### 1. **Scalability**

- Easy to add new domains without cluttering root
- Clear separation of concerns
- Predictable file locations

### 2. **Maintainability**

- Related functions are grouped together
- Easy to find and modify domain-specific logic
- Clear boundaries between different parts of the system

### 3. **Team Collaboration**

- Multiple developers can work on different domains
- Reduced merge conflicts
- Clear ownership of different areas

### 4. **Type Safety**

- Domain-specific types can be co-located
- Better IntelliSense and autocomplete
- Easier to maintain type consistency

### 5. **Testing**

- Domain-specific tests can mirror the structure
- Easier to mock and test individual domains
- Clear test organization

## Best Practices

### 1. **Consistent Naming**

- Use the same domain names across frontend and backend
- Keep file names descriptive and consistent
- Follow TypeScript naming conventions

### 2. **Import Organization**

- Use relative imports within domains
- Use absolute imports for shared utilities
- Keep imports clean and organized

### 3. **Function Organization**

- Group related functions together
- Use clear, descriptive function names
- Add JSDoc comments for complex functions

### 4. **Error Handling**

- Consistent error patterns across domains
- Proper error propagation
- Meaningful error messages

### 5. **Performance**

- Use appropriate indexes for queries
- Optimize for common access patterns
- Consider pagination for large datasets

## Migration Checklist

- [ ] Create domain folders
- [ ] Split existing files by function type
- [ ] Update imports in frontend code
- [ ] Add missing shared utilities
- [ ] Create actions folder for side effects
- [ ] Update documentation
- [ ] Test all functionality
- [ ] Update deployment scripts if needed

This organization pattern provides a solid foundation for scaling your Convex application while maintaining code clarity and team productivity.
