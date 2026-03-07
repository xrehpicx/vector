'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, LogIn } from 'lucide-react';
import Link from 'next/link';
import { extractAuthErrorMessage } from '@/lib/auth-error-handler';
import { authClient } from '@/lib/auth-client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const isEmail = identifier.includes('@');
      const result = isEmail
        ? await authClient.signIn.email({
            email: identifier,
            password,
          })
        : await authClient.signIn.username({
            username: identifier,
            password,
          });

      if (result.error) {
        throw result.error;
      }

      router.refresh();
      router.push(redirectTo);
    } catch (error) {
      console.log('Sign in error: ', error, extractAuthErrorMessage(error));
      setError(extractAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <div className='w-full max-w-sm space-y-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Sign in to Vector
          </h1>
          <p className='text-muted-foreground text-sm'>
            Enter your credentials to continue
          </p>
        </div>

        <form onSubmit={onLogin} className='space-y-4'>
          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className='space-y-1.5'>
            <Label htmlFor='identifier' className='text-sm'>
              Email or Username
            </Label>
            <Input
              id='identifier'
              type='text'
              placeholder='you@example.com'
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              disabled={loading}
              required
              autoFocus
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='password' className='text-sm'>
              Password
            </Label>
            <Input
              id='password'
              type='password'
              placeholder='••••••••'
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <Button type='submit' className='w-full' size='sm' disabled={loading}>
            {loading && <LogIn className='mr-2 h-4 w-4 animate-spin' />}
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <p className='text-muted-foreground text-center text-sm'>
          Don&apos;t have an account?{' '}
          <Link
            href='/auth/signup'
            className='text-foreground font-medium hover:underline'
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className='flex h-screen w-full items-center justify-center'>
          <div className='text-muted-foreground text-sm'>Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
