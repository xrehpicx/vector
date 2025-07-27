"use client";

import type React from "react";
import { CreateProjectDialog } from "./create-project-dialog";
import { PermissionGate } from "@/hooks/use-permissions";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * Thin wrapper kept for backwards-compatibility. Accepts the previous props
 * (`size`, etc.) but forwards to the unified `CreateProjectDialog` component.
 */
interface LegacyCreateProjectButtonProps
  extends React.ComponentProps<typeof CreateProjectDialog> {
  /** Optional size prop kept for API parity but not used. */
  size?: "default" | "sm" | "lg" | "icon";
}

export function CreateProjectButton({
  orgSlug,
  defaultStates,
  ...rest
}: LegacyCreateProjectButtonProps & {
  defaultStates?: {
    teamId?: string;
    leadId?: string;
    statusId?: string;
    [key: string]: unknown;
  };
}) {
  // `_size` is ignored – sizing is handled internally.
  return (
    <PermissionGate orgSlug={orgSlug} permission={PERMISSIONS.PROJECT_CREATE}>
      <CreateProjectDialog
        orgSlug={orgSlug}
        defaultStates={defaultStates}
        {...rest}
      />
    </PermissionGate>
  );
}
