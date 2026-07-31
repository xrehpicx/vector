import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from 'convex/react';

import { api } from '@vector/convex/_generated/api';
import { runtime } from '@/lib/runtime';
import { useWorkspaceStore } from '@/state/workspace';

type WorkspaceContextValue = {
  currentUser: { _id: string; name?: string; email?: string; image?: string };
  orgSlug: string;
  organizations: Array<{ _id: string; name: string; slug: string }>;
  setOrgSlug: (slug: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const organizations = useQuery(api.users.getOrganizations);
  const currentUser = useQuery(api.users.currentUser);
  const orgSlug = useWorkspaceStore(state => state.orgSlug);
  const setOrgSlug = useWorkspaceStore(state => state.setOrgSlug);

  useEffect(() => {
    if (!organizations?.length) return;
    const stillAvailable = organizations.some(org => org.slug === orgSlug);
    if (stillAvailable) return;
    const configured = runtime.orgSlug
      ? organizations.find(org => org.slug === runtime.orgSlug)
      : null;
    setOrgSlug(configured?.slug ?? organizations[0]?.slug ?? null);
  }, [organizations, orgSlug, setOrgSlug]);

  if (!organizations || !currentUser || !orgSlug) return null;

  return (
    <WorkspaceContext.Provider
      value={{
        currentUser,
        orgSlug,
        organizations,
        setOrgSlug,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value)
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
