import { query } from '../_generated/server';
import { v } from 'convex/values';
import { getOrganizationBySlug } from '../authz';

export const listFolders = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await getOrganizationBySlug(ctx, args.orgSlug);

    const folders = await ctx.db
      .query('documentFolders')
      .withIndex('by_organizationId', q => q.eq('organizationId', org._id))
      .collect();

    // Count documents per folder
    const foldersWithCounts = await Promise.all(
      folders.map(async folder => {
        const docs = await ctx.db
          .query('documents')
          .withIndex('by_folder', q => q.eq('folderId', folder._id))
          .collect();

        return {
          ...folder,
          documentCount: docs.length,
        };
      }),
    );

    return foldersWithCounts;
  },
});
