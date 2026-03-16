'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Loader2, CheckCircle2, XCircle, Monitor } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { extractAuthErrorMessage } from '@/lib/auth-error-handler';
import { useBranding } from '@/hooks/use-branding';
import {
  DEFAULT_BRANDING,
  getContrastingTextColor,
  resolveBrandColor,
} from '@/lib/branding';

const REGEXP_ALPHA = /^[A-Z2-9]$/;

type Stage = 'enter-code' | 'approve' | 'approved' | 'denied';

function DeviceAuthForm() {
  const searchParams = useSearchParams();
  const prefilled = searchParams.get('user_code') ?? '';
  const branding = useBranding();
  const accentColor = resolveBrandColor(
    branding.accentColor,
    DEFAULT_BRANDING.accentColor,
  );
  const accentTextColor = getContrastingTextColor(accentColor);

  const [stage, setStage] = useState<Stage>(
    prefilled ? 'approve' : 'enter-code',
  );
  const [userCode, setUserCode] = useState(prefilled);
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    const code = userCode.trim().replace(/-/g, '').toUpperCase();
    if (code.length < 8) {
      toast.error('Enter the full 8-character code');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authClient.device({
        query: { user_code: code },
      });

      if (response.error) {
        throw response.error;
      }

      setUserCode(code);
      setStage('approve');
    } catch (error) {
      toast.error(extractAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await authClient.device.approve({ userCode });
      setStage('approved');
    } catch (error) {
      toast.error(extractAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = async () => {
    setIsLoading(true);
    try {
      await authClient.device.deny({ userCode });
      setStage('denied');
    } catch (error) {
      toast.error(extractAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='flex min-h-dvh items-center justify-center px-4'>
      <div className='w-full max-w-sm'>
        <div className='mb-6 text-center'>
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={branding.name}
              className='mx-auto mb-4 size-12 rounded-xl object-contain'
            />
          )}

          {(stage === 'enter-code' || stage === 'approve') && (
            <div className='bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-xl'>
              <Monitor className='text-muted-foreground size-6' />
            </div>
          )}

          {stage === 'enter-code' && (
            <>
              <h2 className='text-2xl font-semibold tracking-tight'>
                Device sign in
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                Enter the code shown on your device
              </p>
            </>
          )}

          {stage === 'approve' && (
            <>
              <h2 className='text-2xl font-semibold tracking-tight'>
                Authorize device
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                Allow this device to access your {branding.name} account?
              </p>
            </>
          )}

          {stage === 'approved' && (
            <>
              <CheckCircle2 className='mx-auto mb-4 size-12 text-green-500' />
              <h2 className='text-2xl font-semibold tracking-tight'>
                Device authorized
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                You can close this window and return to your device.
              </p>
            </>
          )}

          {stage === 'denied' && (
            <>
              <XCircle className='text-destructive mx-auto mb-4 size-12' />
              <h2 className='text-2xl font-semibold tracking-tight'>
                Authorization denied
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                The device was not authorized. You can close this window.
              </p>
            </>
          )}
        </div>

        {stage === 'enter-code' && (
          <div className='space-y-3'>
            <div className='flex flex-col items-center gap-1.5'>
              <label className='text-sm font-medium'>Device code</label>
              <InputOTP
                maxLength={8}
                autoFocus
                containerClassName='justify-center'
                value={userCode}
                onChange={val => setUserCode(val.toUpperCase())}
                onComplete={handleVerify}
                pattern={REGEXP_ALPHA.source}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                  <InputOTPSlot index={6} />
                  <InputOTPSlot index={7} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button
              onClick={handleVerify}
              className='w-full transition-opacity hover:opacity-90'
              disabled={isLoading || userCode.length < 8}
              style={{
                backgroundColor: accentColor,
                color: accentTextColor,
              }}
            >
              {isLoading ? (
                <span className='flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Verifying...
                </span>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        )}

        {stage === 'approve' && (
          <div className='space-y-3'>
            <div className='bg-muted rounded-md px-4 py-3 text-center'>
              <p className='text-muted-foreground text-xs'>Device code</p>
              <p className='font-mono text-lg font-semibold tracking-widest'>
                {userCode.slice(0, 4)}-{userCode.slice(4)}
              </p>
            </div>
            <Button
              onClick={handleApprove}
              className='w-full transition-opacity hover:opacity-90'
              disabled={isLoading}
              style={{
                backgroundColor: accentColor,
                color: accentTextColor,
              }}
            >
              {isLoading ? (
                <span className='flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Approving...
                </span>
              ) : (
                'Approve'
              )}
            </Button>
            <Button
              variant='outline'
              onClick={handleDeny}
              className='w-full'
              disabled={isLoading}
            >
              Deny
            </Button>
          </div>
        )}

        <p className='text-muted-foreground mt-4 text-center text-sm'>
          <Link
            href='/'
            className='text-foreground font-medium hover:underline'
          >
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function DevicePage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-dvh items-center justify-center px-4'>
          <div className='w-full max-w-sm space-y-6'>
            <div className='flex flex-col items-center gap-2'>
              <Skeleton className='h-12 w-12 rounded-xl' />
              <Skeleton className='h-7 w-48' />
              <Skeleton className='h-4 w-36' />
            </div>
            <div className='space-y-3'>
              <Skeleton className='h-10 w-full rounded-md' />
              <Skeleton className='h-10 w-full rounded-md' />
            </div>
          </div>
        </div>
      }
    >
      <DeviceAuthForm />
    </Suspense>
  );
}
