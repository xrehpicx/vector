'use client';

import { useEffect } from 'react';
import {
  isPushSupported,
  registerNotificationServiceWorker,
} from '@/lib/notifications';

export function NotificationClientBootstrap() {
  // Register SW on mount (page load / PWA open)
  useEffect(() => {
    void registerNotificationServiceWorker().catch(() => {
      // Registration is best-effort until the user explicitly opts into push.
    });
  }, []);

  // Re-check for SW updates when the user returns to the app
  useEffect(() => {
    if (!isPushSupported()) return;

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      void navigator.serviceWorker.getRegistration('/').then(reg => {
        reg?.update().catch(() => {});
      });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
