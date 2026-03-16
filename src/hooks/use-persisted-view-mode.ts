'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ViewMode = 'table' | 'kanban';

function parseStoredViewMode(value: string | null): ViewMode | null {
  if (value === 'table' || value === 'kanban') {
    return value;
  }

  return null;
}

export function usePersistedViewMode({
  storageKey,
  defaultMode,
  queryMode,
  syncUrl,
}: {
  storageKey: string;
  defaultMode: ViewMode;
  queryMode: ViewMode | null;
  syncUrl: (mode: ViewMode) => void;
}) {
  const [viewMode, setViewModeState] = useState<ViewMode>(
    queryMode ?? defaultMode,
  );
  const hydrated = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedMode = parseStoredViewMode(
        window.localStorage.getItem(storageKey),
      );
      const nextMode = queryMode ?? storedMode ?? defaultMode;

      setViewModeState(current => (current === nextMode ? current : nextMode));
      hydrated.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [defaultMode, queryMode, storageKey]);

  useEffect(() => {
    if (!hydrated.current) {
      return;
    }

    window.localStorage.setItem(storageKey, viewMode);
  }, [storageKey, viewMode]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      syncUrl(mode);
    },
    [syncUrl],
  );

  return { viewMode, setViewMode } as const;
}
