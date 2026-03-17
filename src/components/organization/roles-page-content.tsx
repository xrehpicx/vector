'use client';

import { useState, useMemo } from 'react';
import { Plus, Shield, Crown, Settings, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, useCachedQuery } from '@/lib/convex';
import { CreateRoleDialog } from './create-role-dialog';
import { EditRoleDialog } from './edit-role-dialog';
import { AssignRoleDialog } from './assign-role-dialog';
import { CustomRolesTable } from './custom-roles-table';
import { useScopedPermission } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { useConfirm } from '@/hooks/use-confirm';
import type { OrganizationRoleId } from '@/lib/organization-role-types';

interface RolesPageContentProps {
  orgSlug: string;
}

const BUILT_IN_ROLES = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Complete control over the organization',
    icon: Crown,
    color: 'text-amber-600',
    permissions: ['All permissions'],
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Full management except billing and deletion',
    icon: Settings,
    color: 'text-blue-600',
    permissions: [
      'Manage Settings',
      'Manage Members',
      'Manage Roles',
      'Teams',
      'Projects',
      'Issues',
      'Views',
    ],
  },
  {
    key: 'member',
    name: 'Member',
    description: 'View and contribute to projects, issues, and views',
    icon: UserCheck,
    color: 'text-green-600',
    permissions: [
      'View Org',
      'Create Issues',
      'View Issues',
      'View Teams',
      'View Projects',
      'Create Views',
    ],
  },
] as const;

export function RolesPageContent({ orgSlug }: RolesPageContentProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<OrganizationRoleId | null>(
    null,
  );
  const [assigningRole, setAssigningRole] = useState<OrganizationRoleId | null>(
    null,
  );
  const [confirm, ConfirmDialog] = useConfirm();

  const { hasPermission: canManageRoles } = useScopedPermission(
    { orgSlug },
    PERMISSIONS.ORG_MANAGE_ROLES,
  );

  const membersQuery = useCachedQuery(api.organizations.queries.listMembers, {
    orgSlug,
  });
  const roleDocsQuery = useCachedQuery(api.roles.index.list, { orgSlug });

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { owner: 0, admin: 0, member: 0 };
    const members = membersQuery ?? [];
    members.forEach((m: { role: string }) => {
      if (counts[m.role] !== undefined) counts[m.role]++;
    });
    return counts;
  }, [membersQuery]);

  const roles = useMemo(() => {
    const roleDocs = roleDocsQuery ?? [];
    return roleDocs.map(role => ({
      _id: role._id,
      name: role.name,
      description: role.description,
      createdAt: role._creationTime,
      system: role.system,
    }));
  }, [roleDocsQuery]);

  const handleDeleteRole = async (roleId: OrganizationRoleId) => {
    const ok = await confirm({
      title: 'Delete role',
      description:
        'This will permanently delete the role and remove it from all members.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      console.log('Delete role:', roleId);
    } catch (error) {
      console.error('Failed to delete role:', error);
    }
  };

  return (
    <div className='space-y-6'>
      {/* Built-in Roles */}
      <div>
        <h3 className='mb-2 text-sm font-semibold'>Default Roles</h3>
        <div className='divide-y'>
          {BUILT_IN_ROLES.map(role => {
            const IconComponent = role.icon;
            return (
              <div key={role.key} className='flex items-center gap-3 px-3 py-2'>
                <IconComponent
                  className={`size-4 flex-shrink-0 ${role.color}`}
                />
                <div className='min-w-0 flex-1'>
                  <div className='truncate text-sm font-medium'>
                    {role.name}
                  </div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {role.description}
                  </div>
                </div>
                <div className='text-muted-foreground flex flex-shrink-0 items-center gap-3'>
                  <span className='hidden text-xs sm:inline'>
                    {role.permissions.join(' · ')}
                  </span>
                  <span className='flex items-center gap-1 text-xs'>
                    <Users className='size-3' />
                    {roleCounts[role.key]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Roles */}
      <div>
        <div className='mb-2 flex items-center justify-between'>
          <h3 className='text-sm font-semibold'>Custom Roles</h3>
          {canManageRoles && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className='mr-1 size-3' />
              Create Role
            </Button>
          )}
        </div>

        {roles.length === 0 ? (
          <div className='flex items-center justify-center py-8'>
            <div className='text-center'>
              <Shield className='text-muted-foreground mx-auto mb-2 size-5' />
              <p className='text-muted-foreground text-sm'>
                No custom roles yet
              </p>
              {canManageRoles && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='mt-2'
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className='mr-1 size-3' />
                  Create your first role
                </Button>
              )}
            </div>
          </div>
        ) : (
          <CustomRolesTable
            roles={roles}
            canAssign={canManageRoles}
            canEdit={canManageRoles}
            canDelete={canManageRoles}
            onAssign={id => setAssigningRole(id)}
            onEdit={id => setEditingRole(id)}
            onDelete={id => handleDeleteRole(id)}
          />
        )}
      </div>

      {/* Dialogs */}
      {showCreateDialog && (
        <CreateRoleDialog
          orgSlug={orgSlug}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={() => setShowCreateDialog(false)}
        />
      )}

      {editingRole && (
        <EditRoleDialog
          orgSlug={orgSlug}
          roleId={editingRole}
          onClose={() => setEditingRole(null)}
          onSuccess={() => setEditingRole(null)}
        />
      )}

      {assigningRole && (
        <AssignRoleDialog
          orgSlug={orgSlug}
          roleId={assigningRole}
          onClose={() => setAssigningRole(null)}
          onSuccess={() => setAssigningRole(null)}
        />
      )}
      <ConfirmDialog />
    </div>
  );
}
