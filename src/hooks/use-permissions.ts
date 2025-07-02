import React from "react";
import { trpc } from "@/lib/trpc";
import type { Permission } from "@/auth/permission-constants";

/**
 * React hook for checking user permissions in an organization.
 * Returns a boolean indicating if the user has the requested permission.
 *
 * @param orgSlug - Organization slug
 * @param permission - Permission to check
 * @returns Object with { hasPermission: boolean, isLoading: boolean }
 */
export function usePermission(orgSlug: string, permission: Permission) {
  const { data: hasPermission = false, isLoading } =
    trpc.organization.hasPermission.useQuery(
      { orgSlug, permission },
      {
        enabled: !!orgSlug && !!permission,
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    );

  return { hasPermission, isLoading };
}

/**
 * React hook for checking multiple permissions at once.
 * Returns a map of permission -> boolean for efficient bulk checking.
 *
 * This is the preferred method when checking multiple permissions as it
 * batches all checks into a single request.
 */
export function usePermissions(orgSlug: string, permissions: Permission[]) {
  const { data: permissionMap = {}, isLoading } =
    trpc.organization.hasPermissions.useQuery(
      { orgSlug, permissions },
      {
        enabled: !!orgSlug && permissions.length > 0,
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    );

  return { permissions: permissionMap, isLoading };
}

/**
 * Higher-order component that conditionally renders children based on permission.
 *
 * For better performance when checking multiple permissions, consider using
 * usePermissions() with conditional rendering instead.
 *
 * @example
 * <PermissionGate orgSlug="acme" permission="project:create">
 *   <CreateProjectButton />
 * </PermissionGate>
 *
 * @example
 * // Better for multiple permissions:
 * const { permissions, isLoading } = usePermissions(orgSlug, [
 *   PERMISSIONS.PROJECT_CREATE,
 *   PERMISSIONS.TEAM_CREATE
 * ]);
 *
 * if (isLoading) return <Skeleton />;
 *
 * return (
 *   <>
 *     {permissions[PERMISSIONS.PROJECT_CREATE] && <CreateProjectButton />}
 *     {permissions[PERMISSIONS.TEAM_CREATE] && <CreateTeamButton />}
 *   </>
 * );
 */
interface PermissionGateProps {
  orgSlug: string;
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({
  orgSlug,
  permission,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission, isLoading } = usePermission(orgSlug, permission);

  if (isLoading) return null;
  if (!hasPermission) return fallback;

  return children;
}

/**
 * Hook that returns a memoized permission checker function.
 * Useful for inline permission checks without triggering re-renders.
 */
export function usePermissionChecker(
  orgSlug: string,
  permissions: Permission[],
) {
  const { permissions: permissionMap, isLoading } = usePermissions(
    orgSlug,
    permissions,
  );

  const checker = React.useCallback(
    (permission: Permission) => {
      return permissionMap[permission] ?? false;
    },
    [permissionMap],
  );

  return { can: checker, isLoading };
}
