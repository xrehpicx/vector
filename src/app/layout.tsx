import type { Metadata } from 'next';
import { Geist, Poppins, Urbanist } from 'next/font/google';
import './globals.css';
import { TopLoaderProvider } from '@/providers/top-loader-provider';
import { ConvexAuthProvider } from '@/providers/convex-auth-provider';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { NotificationClientBootstrap } from '@/components/notifications/notification-client-bootstrap';
import { BrandingHead } from '@/components/branding-head';
import { getToken } from '@/lib/auth-server';
import { ThemeProvider } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const urbanist = Urbanist({
  variable: '--font-title',
  subsets: ['latin'],
});

const poppins = Poppins({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400'],
});

export const metadata: Metadata = {
  title: 'Vector',
  description: 'Project management platform',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/icons/vector-mark-gradient.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icons/vector-mark-dark.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: light)',
      },
    ],
    apple: '/icons/vector-logo-180.png',
  },
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
    <html
      lang='en'
      className={cn('font-sans', geist.variable)}
      suppressHydrationWarning
    >
      <body className={`${urbanist.variable} ${poppins.variable} antialiased`}>
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
