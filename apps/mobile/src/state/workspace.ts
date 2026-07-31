import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type WorkspaceState = {
  orgSlug: string | null;
  setOrgSlug: (orgSlug: string | null) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    set => ({
      orgSlug: null,
      setOrgSlug: orgSlug => set({ orgSlug }),
    }),
    {
      name: 'vector-mobile-workspace',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
