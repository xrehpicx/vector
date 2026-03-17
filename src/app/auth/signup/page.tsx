'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

export const dynamic = 'force-dynamic';

const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be 20 characters or fewer')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Only letters, numbers, hyphens, and underscores',
    ),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password must be 128 characters or fewer'),
});

type SignUpFormType = z.infer<typeof signUpSchema>;

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignUpFormType>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', username: '', password: '' },
  });

  const handleSubmit = async (values: SignUpFormType) => {
    setIsLoading(true);

    try {
      const normalizedEmail = values.email.trim().toLowerCase();

      const result = await authClient.signUp.email({
        email: normalizedEmail,
        password: values.password,
        name: values.username,
        username: values.username,
      });

      if (result.error) {
        throw result.error;
      }

      toast.success('Account created!');
      router.push(
        `/auth/signing-in?redirectTo=${encodeURIComponent(redirectTo)}`,
      );
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
            Create account
          </h1>
          <p className='text-muted-foreground text-sm'>
            Set up your Vector account
          </p>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className='space-y-4'
              noValidate
            >
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='email'
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
                name='username'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='text'
                        placeholder='Choose a username'
                        autoComplete='username'
                        disabled={isLoading}
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
                    <FormLabel className='text-xs'>Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='Min 6 characters'
                        autoComplete='new-password'
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
                    Creating account…
                  </span>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>

        <CardFooter className='justify-center'>
          <p className='text-muted-foreground text-sm'>
            Already have an account?{' '}
            <Link
              href='/auth/login'
              className='text-foreground font-medium hover:underline'
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

export default function SignupPage() {
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
              <Skeleton className='h-5 w-28' />
              <Skeleton className='h-4 w-44' />
            </div>
            <div className='space-y-4 px-4'>
              <div className='space-y-2'>
                <Skeleton className='h-3.5 w-12' />
                <Skeleton className='h-9 w-full rounded-md' />
              </div>
              <div className='space-y-2'>
                <Skeleton className='h-3.5 w-20' />
                <Skeleton className='h-9 w-full rounded-md' />
              </div>
              <div className='space-y-2'>
                <Skeleton className='h-3.5 w-16' />
                <Skeleton className='h-9 w-full rounded-md' />
              </div>
              <Skeleton className='h-9 w-full rounded-md' />
            </div>
            <div className='bg-muted/50 flex justify-center border-t p-4'>
              <Skeleton className='h-4 w-40' />
            </div>
          </div>
        </AuthShell>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
