"use client";

import { Badge } from "./badge";
import { useScopedPermission } from "@/hooks/use-permissions";
import type { PermissionScope } from "@/hooks/use-permissions";
import type { Permission } from "@/convex/_shared/permissions";

interface PermissionIndicatorProps {
  scope: PermissionScope;
  permission: Permission;
  label?: string;
}

/**
 * Simple component to show whether a user has a specific permission.
 * Useful for debugging or admin interfaces.
 */
export function PermissionIndicator({
  scope,
  permission,
  label,
}: PermissionIndicatorProps) {
  const { hasPermission, isLoading } = useScopedPermission(scope, permission);

  if (isLoading) {
    return (
      <Badge variant="outline" className="text-xs">
        {label || permission}: checking...
      </Badge>
    );
  }

  return (
    <Badge
      variant={hasPermission ? "default" : "secondary"}
      className={`text-xs ${
        hasPermission
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
      }`}
    >
      {label || permission}: {hasPermission ? "✓" : "✗"}
    </Badge>
  );
}
