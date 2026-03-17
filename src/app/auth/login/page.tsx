'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { extractAuthErrorMessage } from '@/lib/auth-error-handler';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { AuthLogo, AuthShell } from '../_components/auth-brand-panel';

const signInSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

type SignInFormType = z.infer<typeof signInSchema>;

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignInFormType>({
    resolver: zodResolver(signInSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const handleSubmit = async (values: SignInFormType) => {
    setIsLoading(true);

    try {
      const isEmail = values.identifier.includes('@');
      const result = isEmail
        ? await authClient.signIn.email({
            email: values.identifier,
            password: values.password,
          })
        : await authClient.signIn.username({
            username: values.identifier,
            password: values.password,
          });

      if (result.error) {
        throw result.error;
      }

      window.location.href = `/auth/signing-in?redirectTo=${encodeURIComponent(redirectTo)}`;
    } catch (error) {
      const message = extractAuthErrorMessage(error);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthLogo className='mb-8' />

      <Card>
        <CardHeader>
          <h1 className='font-title text-lg font-semibold tracking-tight'>
            Sign in
          </h1>
          <p className='text-muted-foreground text-sm'>
            Enter your credentials to continue
          </p>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='identifier'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Email or Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='text'
                        placeholder='you@example.com'
                        autoComplete='email'
                        disabled={isLoading}
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex items-center justify-between'>
                      <FormLabel className='text-xs'>Password</FormLabel>
                      <Link
                        href='/auth/forgot-password'
                        className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                      >
                        Forgot?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='Your password'
                        autoComplete='current-password'
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type='submit'
                className='!mt-5 w-full'
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className='flex items-center gap-2'>
                    <Loader2 className='size-3.5 animate-spin' />
                    Signing in…
                  </span>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>

        <CardFooter className='justify-center'>
          <p className='text-muted-foreground text-sm'>
            No account?{' '}
            <Link
              href='/auth/signup'
              className='text-foreground font-medium hover:underline'
            >
              Create one
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <div className='mb-8 flex items-center justify-center gap-2.5'>
            <Skeleton className='size-9 rounded-lg' />
            <Skeleton className='h-6 w-20' />
          </div>
          <div className='bg-card ring-foreground/10 flex flex-col gap-4 rounded-xl py-4 ring-1'>
            <div className='space-y-1 px-4'>
              <Skeleton className='h-5 w-16' />
              <Skeleton className='h-4 w-48' />
            </div>
            <div className='space-y-4 px-4'>
              <div className='space-y-2'>
                <Skeleton className='h-3.5 w-28' />
                <Skeleton className='h-9 w-full rounded-md' />
              </div>
              <div className='space-y-2'>
                <Skeleton className='h-3.5 w-16' />
                <Skeleton className='h-9 w-full rounded-md' />
              </div>
              <Skeleton className='h-9 w-full rounded-md' />
            </div>
            <div className='bg-muted/50 flex justify-center border-t p-4'>
              <Skeleton className='h-4 w-32' />
            </div>
          </div>
        </AuthShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
