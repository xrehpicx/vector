import type { Metadata } from 'next';
import './globals.css';
import { TopLoaderProvider } from '@/providers/top-loader-provider';
import { ConvexAuthProvider } from '@/providers/convex-auth-provider';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { NotificationClientBootstrap } from '@/components/notifications/notification-client-bootstrap';
import { BrandingHead } from '@/components/branding-head';
import { getToken } from '@/lib/auth-server';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Vector',
  description: 'Project management platform',
  manifest: '/manifest.webmanifest',
};

export const dynamic = 'force-dynamic';

async function getInitialToken() {
  try {
    return await getToken();
  } catch (error) {
    console.error('Failed to load auth token during app bootstrap.', error);
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' className='font-sans' suppressHydrationWarning>
      <body className='antialiased'>
        <ThemeProvider
          attribute='class'
          defaultTheme='light'
          disableTransitionOnChange
        >
          <TopLoaderProvider />
          <ErrorBoundary>
            <ConvexAuthProvider initialToken={await getInitialToken()}>
              <NotificationClientBootstrap />
              <BrandingHead />
              {children}
              <Toaster />
            </ConvexAuthProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
