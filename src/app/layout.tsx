import type { Metadata } from 'next';
import { Urbanist, Poppins } from 'next/font/google';
import './globals.css';
import { TopLoaderProvider } from '@/providers/top-loader-provider';
import { ConvexAuthProvider } from '@/providers/convex-auth-provider';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { getToken } from '@/lib/auth-server';

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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body className={`${urbanist.variable} ${poppins.variable} antialiased`}>
        <TopLoaderProvider />
        <ErrorBoundary>
          <ConvexAuthProvider initialToken={await getToken()}>
            {children}
            <Toaster />
          </ConvexAuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
