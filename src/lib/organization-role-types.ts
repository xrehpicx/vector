import type { Id } from '@/convex/_generated/dataModel';

export type OrganizationRoleId = Id<'roles'> | Id<'orgRoles'>;

export interface OrganizationRoleSummary {
  _id: OrganizationRoleId;
  name: string;
  description?: string;
  system?: boolean;
  createdAt?: number;
}
