# Phase 5: File Storage

## Overview

This phase migrates from S3 to Convex Storage, updating file upload/download patterns and handling existing file migration.

## Implementation Tasks

| #   | Task                                                                                                                                    | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 5.1 | **Research Convex Storage patterns** – Google "Convex storage 2024", "Convex file upload patterns", "Convex storage migration from S3". | ❌     |
| 5.2 | **Implement Convex Storage functions** – Create file upload, download, and management functions.                                        | ❌     |
| 5.3 | **Update frontend file handling** – Replace S3 presigned URLs with Convex storage patterns.                                             | ❌     |
| 5.4 | **Migrate existing S3 files** – Create background job to migrate existing org logo files.                                               | ❌     |
| 5.5 | **Update file access patterns** – Replace S3 route handlers with Convex storage access.                                                 | ❌     |
| 5.6 | **Test file operations** – Verify upload, download, and access controls work correctly.                                                 | ❌     |

## Current Status: ❌ PENDING

### 5.1 Convex Storage Research ❌

**Task:** Research current Convex Storage implementation patterns and best practices.

**Research Areas:**

- Convex Storage beta features and limitations
- File upload/download patterns
- Storage quotas and performance
- Migration strategies from S3
- Access control patterns

**Expected Findings:**

- Convex Storage uses `storage.generateUploadUrl()` for uploads
- Files accessed via `storage.getUrl()` for downloads
- Organization-scoped file access controls
- Background migration strategies for existing files

### 5.2 Convex Storage Implementation ❌

**Target Implementation:**

```typescript
// convex/actions/files.ts
export const generateUploadUrl = action({
  args: {
    organizationId: v.id("organizations"),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify organization access
    const { userId } = await checkOrganizationAccess(ctx, args.organizationId);

    // Generate upload URL
    const uploadUrl = await ctx.storage.generateUploadUrl();

    // Store file metadata
    await ctx.runMutation(internal.files.createMetadata, {
      organizationId: args.organizationId,
      fileName: args.fileName,
      contentType: args.contentType,
      storageId: uploadUrl.storageId,
    });

    return uploadUrl;
  },
});

export const getFileUrl = action({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    // Get file metadata
    const file = await ctx.runQuery(internal.files.getById, {
      id: args.fileId,
    });
    if (!file) throw new Error("File not found");

    // Check access permissions
    const { userId } = await checkOrganizationAccess(ctx, file.organizationId);

    // Generate download URL
    return await ctx.storage.getUrl(file.storageId);
  },
});
```

### 5.3 Frontend File Handling ❌

**Current S3 Implementation (`src/lib/s3.ts`):**

```typescript
// Current S3 patterns
export const getPresignedUploadUrl = async (
  key: string,
  contentType: string,
) => {
  // S3 presigned URL generation
};

export const getPresignedReadUrl = async (key: string) => {
  // S3 presigned download URL
};
```

**Target Convex Implementation:**

```typescript
// New Convex storage patterns
export const uploadFile = async (file: File, organizationId: string) => {
  const uploadUrl = await convex.action(actions.files.generateUploadUrl, {
    organizationId,
    fileName: file.name,
    contentType: file.type,
  });

  // Upload to Convex Storage
  await fetch(uploadUrl.url, {
    method: "POST",
    body: file,
  });

  return uploadUrl.storageId;
};

export const getFileUrl = async (fileId: string) => {
  return await convex.action(actions.files.getFileUrl, { fileId });
};
```

### 5.4 S3 Migration Strategy ❌

**Migration Approach:**

1. **Background Migration Job:**

   ```typescript
   export const migrateS3Files = action({
     args: {
       organizationId: v.id("organizations"),
     },
     handler: async (ctx, args) => {
       // Get existing S3 files for organization
       const s3Files = await getS3FilesForOrg(args.organizationId);

       for (const s3File of s3Files) {
         // Download from S3
         const fileData = await downloadFromS3(s3File.key);

         // Upload to Convex Storage
         const uploadUrl = await ctx.storage.generateUploadUrl();
         await fetch(uploadUrl.url, {
           method: "POST",
           body: fileData,
         });

         // Update database records
         await ctx.runMutation(internal.files.migrateFromS3, {
           oldKey: s3File.key,
           newStorageId: uploadUrl.storageId,
           organizationId: args.organizationId,
         });
       }
     },
   });
   ```

2. **File Metadata Schema:**
   ```typescript
   // convex/schema.ts
   files: defineTable({
     organizationId: v.id("organizations"),
     fileName: v.string(),
     contentType: v.string(),
     storageId: v.string(), // Convex Storage ID
     size: v.number(),
     uploadedAt: v.number(),
   })
     .index("by_organization", ["organizationId"])
     .index("by_storage_id", ["storageId"]),
   ```

### 5.5 File Access Pattern Updates ❌

**Current S3 Route (`src/app/api/files/[...key]/route.ts`):**

```typescript
// Current S3 file access
export async function GET(request: Request) {
  const key = getKeyFromRequest(request);
  const presignedUrl = await getPresignedReadUrl(key);
  return Response.redirect(presignedUrl);
}
```

**Target Convex Implementation:**

```typescript
// New Convex file access
export const getFileAccess = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");

    // Check permissions
    const { userId } = await checkOrganizationAccess(ctx, file.organizationId);

    return {
      url: await ctx.storage.getUrl(file.storageId),
      metadata: file,
    };
  },
});
```

## Implementation Strategy

### Phase 5.1: Research and Planning ❌

- [ ] Research Convex Storage capabilities
- [ ] Document current S3 usage patterns
- [ ] Plan migration strategy
- [ ] Design file metadata schema

### Phase 5.2: Core Implementation ❌

- [ ] Implement file upload functions
- [ ] Implement file download functions
- [ ] Add file metadata management
- [ ] Implement access controls

### Phase 5.3: Frontend Integration ❌

- [ ] Update file upload components
- [ ] Update file download patterns
- [ ] Replace S3 presigned URL usage
- [ ] Update file access routes

### Phase 5.4: Migration ❌

- [ ] Create migration background job
- [ ] Migrate existing S3 files
- [ ] Update database records
- [ ] Verify migration success

### Phase 5.5: Testing ❌

- [ ] Test file upload functionality
- [ ] Test file download functionality
- [ ] Test access controls
- [ ] Test migration process

## Key Considerations

### 1. **Storage Limitations**

- Convex Storage is in beta
- May have size/performance constraints
- Need to monitor storage quotas
- Consider fallback strategies

### 2. **Migration Complexity**

- Existing S3 files need migration
- Database records need updating
- Access patterns need changing
- Testing required for all scenarios

### 3. **Performance Impact**

- Convex Storage vs S3 performance
- Upload/download speed differences
- Caching strategies
- CDN considerations

### 4. **Access Control**

- Organization-scoped file access
- Permission-based file access
- Public vs private file handling
- Security considerations

## Migration Benefits

### 1. **Simplified Architecture**

- Single storage provider
- Built-in access controls
- Unified file management
- Reduced external dependencies

### 2. **Better Integration**

- Native Convex integration
- Real-time file updates
- Automatic type safety
- Simplified error handling

### 3. **Cost Optimization**

- Potentially lower storage costs
- Reduced bandwidth costs
- Simplified billing
- Better resource utilization

## Next Steps

1. **Complete research** (Phase 5.1)
2. **Implement core functionality** (Phase 5.2)
3. **Update frontend integration** (Phase 5.3)
4. **Execute migration** (Phase 5.4)
5. **Comprehensive testing** (Phase 5.5)

The file storage migration will complete the core infrastructure migration and provide a unified file management system.
