import type { Metadata } from 'next';
import { Urbanist, Poppins, Geist } from 'next/font/google';
import './globals.css';
import { TopLoaderProvider } from '@/providers/top-loader-provider';
import { ConvexAuthProvider } from '@/providers/convex-auth-provider';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { NotificationClientBootstrap } from '@/components/notifications/notification-client-bootstrap';
import { getToken } from '@/lib/auth-server';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { FontProvider } from '@/components/font-provider';

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const urbanist = Urbanist({
  variable: '--font-urbanist',
  subsets: ['latin'],
});

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Vector',
  description: 'Project management platform',
  manifest: '/manifest.webmanifest',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang='en'
      className={cn(geist.variable, urbanist.variable, poppins.variable)}
      suppressHydrationWarning
    >
      <body className='antialiased'>
        <ThemeProvider
          attribute='class'
          defaultTheme='light'
          disableTransitionOnChange
        >
          <FontProvider>
            <TopLoaderProvider />
            <ErrorBoundary>
              <ConvexAuthProvider initialToken={await getToken()}>
                <NotificationClientBootstrap />
                {children}
                <Toaster />
              </ConvexAuthProvider>
            </ErrorBoundary>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
