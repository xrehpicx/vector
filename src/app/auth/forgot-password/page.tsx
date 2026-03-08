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
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { extractAuthErrorMessage } from '@/lib/auth-error-handler';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';

const requestSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});
type RequestFormType = z.infer<typeof requestSchema>;

const resetSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm your new password'),
  })
  .refine(data => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type ResetFormType = z.infer<typeof resetSchema>;

function ForgotPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get('step');
  const emailParam = searchParams.get('email') || '';

  const [step, setStep] = useState<'request' | 'reset'>(
    stepParam === 'reset' ? 'reset' : 'request',
  );
  const [email, setEmail] = useState(emailParam);
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const requestForm = useForm<RequestFormType>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: emailParam },
  });

  const resetForm = useForm<ResetFormType>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const handleRequest = async (values: RequestFormType) => {
    setIsLoading(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: values.email,
        type: 'forget-password',
      });

      if (result.error) {
        throw result.error;
      }

      setEmail(values.email);
      setStep('reset');
      router.replace(
        `/auth/forgot-password?step=reset&email=${encodeURIComponent(values.email)}`,
      );
      toast.success('Reset code sent! Check your email.');
    } catch (error) {
      toast.error(extractAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (values: ResetFormType) => {
    if (!otpCode || otpCode.length < 4) {
      toast.error('Enter the 4-digit code');
      return;
    }

    setIsLoading(true);
    try {
      const result = await authClient.emailOtp.resetPassword({
        email,
        otp: otpCode,
        password: values.password,
      });

      if (result.error) {
        throw result.error;
      }

      toast.success('Password reset successful. Signing you in...');

      // resetPassword may already establish a session; try explicit sign-in as well
      await authClient.signIn.email({
        email,
        password: values.password,
      });

      // Full page reload so the browser picks up new session cookies
      window.location.href = '/auth/signing-in';
    } catch (error) {
      toast.error(extractAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setIsLoading(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'forget-password',
      });
      if (result.error) throw result.error;
      toast.success('Code resent');
    } catch (error) {
      toast.error(extractAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'reset') {
    return (
      <div className='flex min-h-dvh items-center justify-center px-4'>
        <div className='w-full max-w-sm'>
          <div className='mb-6 text-center'>
            <h2 className='text-2xl font-semibold tracking-tight'>
              Check your email
            </h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              We sent a reset code to{' '}
              <span className='font-medium'>{email}</span>
            </p>
          </div>

          <Form {...resetForm}>
            <form
              onSubmit={resetForm.handleSubmit(handleReset)}
              className='space-y-3'
            >
              <div className='flex flex-col items-center gap-1.5'>
                <label className='text-sm font-medium'>Reset code</label>
                <InputOTP
                  maxLength={4}
                  autoFocus
                  containerClassName='justify-center'
                  value={otpCode}
                  onChange={setOtpCode}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <FormField
                control={resetForm.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='sr-only'>New password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='New password'
                        autoComplete='new-password'
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={resetForm.control}
                name='confirmPassword'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='sr-only'>Confirm password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='Confirm new password'
                        autoComplete='new-password'
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type='submit' className='w-full' disabled={isLoading}>
                {isLoading ? (
                  <span className='flex items-center gap-2'>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Resetting...
                  </span>
                ) : (
                  'Reset password'
                )}
              </Button>

              <div className='mt-4 flex items-center justify-center gap-3'>
                <button
                  type='button'
                  onClick={handleResend}
                  className='text-foreground text-sm font-medium hover:underline'
                  disabled={isLoading}
                >
                  Resend code
                </button>
                <span className='text-muted-foreground text-sm'>·</span>
                <Link
                  href='/auth/login'
                  className='text-foreground text-sm font-medium hover:underline'
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          </Form>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-h-dvh items-center justify-center px-4'>
      <div className='w-full max-w-sm'>
        <div className='mb-6 text-center'>
          <h2 className='text-2xl font-semibold tracking-tight'>
            Reset your password
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Enter your email and we&apos;ll send you a code to reset your
            password.
          </p>
        </div>

        <Form {...requestForm}>
          <form
            onSubmit={requestForm.handleSubmit(handleRequest)}
            className='space-y-3'
          >
            <FormField
              control={requestForm.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='sr-only'>Email</FormLabel>
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

            <Button type='submit' className='w-full' disabled={isLoading}>
              {isLoading ? (
                <span className='flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Sending...
                </span>
              ) : (
                'Send reset code'
              )}
            </Button>

            <p className='text-muted-foreground mt-4 text-center text-sm'>
              Remembered your password?{' '}
              <Link
                href='/auth/login'
                className='text-foreground font-medium hover:underline'
              >
                Back to sign in
              </Link>
            </p>
          </form>
        </Form>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-dvh items-center justify-center px-4'>
          <div className='w-full max-w-sm space-y-6'>
            <div className='flex flex-col items-center gap-2'>
              <Skeleton className='h-7 w-48' />
              <Skeleton className='h-4 w-64' />
            </div>
            <div className='space-y-3'>
              <Skeleton className='h-10 w-full rounded-md' />
              <Skeleton className='h-10 w-full rounded-md' />
            </div>
            <Skeleton className='mx-auto h-4 w-48' />
          </div>
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
