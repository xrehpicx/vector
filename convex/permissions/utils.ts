import { query } from '../_generated/server';
import { v } from 'convex/values';
import {
  getOrganizationBySlug,
  getPermissionMap,
  hasScopedPermission,
  permissionValidator,
} from '../authz';
import { getAuthUserId } from '../authUtils';
import { PERMISSION_VALUES } from '../_shared/permissions';

export { hasScopedPermission, requireScopedPermission } from '../authz';
export { PERMISSIONS, type Permission } from '../_shared/permissions';
export {
  type PermissionScope,
  type VisibilityState,
  requireOrgPermission as requirePermission,
} from '../authz';

export const has = query({
  args: {
    orgSlug: v.string(),
    permission: permissionValidator,
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const org = await getOrganizationBySlug(ctx, args.orgSlug);

    return hasScopedPermission(
      ctx,
      {
        organizationId: org._id,
        teamId: args.teamId,
        projectId: args.projectId,
      },
      userId,
      args.permission,
    );
  },
});

export const hasMultiple = query({
  args: {
    orgSlug: v.string(),
    permissions: v.array(
      v.union(...PERMISSION_VALUES.map(permission => v.literal(permission))),
    ),
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const results: Record<string, boolean> = {};

    if (!userId) {
      for (const permission of args.permissions) {
        results[permission] = false;
      }
      return results;
    }

    const org = await getOrganizationBySlug(ctx, args.orgSlug);

    return getPermissionMap(
      ctx,
      {
        organizationId: org._id,
        teamId: args.teamId,
        projectId: args.projectId,
      },
      userId,
      args.permissions,
    );
  },
});
