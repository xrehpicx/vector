'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, UserPlus, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { extractAuthErrorMessage } from '@/lib/auth-error-handler';
import { authClient } from '@/lib/auth-client';

export const dynamic = 'force-dynamic';

const validateEmail = (
  email: string
): { isValid: boolean; message: string } => {
  if (!email) return { isValid: false, message: 'Email is required' };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, message: 'Please enter a valid email address' };
  }
  return { isValid: true, message: '' };
};

const validateUsername = (
  username: string
): { isValid: boolean; message: string } => {
  if (!username) return { isValid: false, message: 'Username is required' };
  if (username.length < 3) {
    return {
      isValid: false,
      message: 'Username must be at least 3 characters long',
    };
  }
  if (username.length > 20) {
    return {
      isValid: false,
      message: 'Username must be less than 20 characters',
    };
  }
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(username)) {
    return {
      isValid: false,
      message: 'Only letters, numbers, hyphens, and underscores',
    };
  }
  return { isValid: true, message: '' };
};

const validatePassword = (
  password: string
): {
  isValid: boolean;
  message: string;
  strength: 'weak' | 'medium' | 'strong';
} => {
  if (!password)
    return {
      isValid: false,
      message: 'Password is required',
      strength: 'weak',
    };
  if (password.length < 6) {
    return {
      isValid: false,
      message: 'Must be at least 6 characters',
      strength: 'weak',
    };
  }
  if (password.length > 128) {
    return {
      isValid: false,
      message: 'Must be less than 128 characters',
      strength: 'weak',
    };
  }

  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (password.length >= 12) strength = 'strong';
  else if (password.length >= 8) strength = 'medium';

  return { isValid: true, message: '', strength };
};

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [emailValidation, setEmailValidation] = useState({
    isValid: false,
    message: '',
  });
  const [usernameValidation, setUsernameValidation] = useState({
    isValid: false,
    message: '',
  });
  const [passwordValidation, setPasswordValidation] = useState<{
    isValid: boolean;
    message: string;
    strength: 'weak' | 'medium' | 'strong';
  }>({ isValid: false, message: '', strength: 'weak' });

  useEffect(() => {
    const t = setTimeout(() => setEmailValidation(validateEmail(email)), 300);
    return () => clearTimeout(t);
  }, [email]);

  useEffect(() => {
    const t = setTimeout(
      () => setUsernameValidation(validateUsername(username)),
      300
    );
    return () => clearTimeout(t);
  }, [username]);

  useEffect(() => {
    const t = setTimeout(
      () => setPasswordValidation(validatePassword(password)),
      300
    );
    return () => clearTimeout(t);
  }, [password]);

  const isFormValid =
    emailValidation.isValid &&
    usernameValidation.isValid &&
    passwordValidation.isValid;

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalEmail = validateEmail(email);
    const finalUsername = validateUsername(username);
    const finalPassword = validatePassword(password);

    setEmailValidation(finalEmail);
    setUsernameValidation(finalUsername);
    setPasswordValidation(finalPassword);

    if (
      !finalEmail.isValid ||
      !finalUsername.isValid ||
      !finalPassword.isValid
    ) {
      setError('Please fix the validation errors above');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name: username,
        username,
      });

      if (result.error) {
        throw result.error;
      }

      router.refresh();
      router.push(redirectTo);
    } catch (error) {
      console.error('Sign up error:', error);
      setError(extractAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const statusIcon = (valid: boolean, value: string) => {
    if (!value) return null;
    return valid ? (
      <CheckCircle className='h-3.5 w-3.5 text-green-500' />
    ) : (
      <XCircle className='h-3.5 w-3.5 text-red-500' />
    );
  };

  const strengthBar = passwordValidation.isValid && password && (
    <div className='flex items-center gap-2'>
      <div className='h-1 flex-1 rounded-full bg-gray-200'>
        <div
          className={`h-1 rounded-full transition-all duration-300 ${
            passwordValidation.strength === 'weak'
              ? 'w-1/3 bg-red-500'
              : passwordValidation.strength === 'medium'
                ? 'w-2/3 bg-yellow-500'
                : 'w-full bg-green-500'
          }`}
        />
      </div>
      <span
        className={`text-xs ${
          passwordValidation.strength === 'strong'
            ? 'text-green-600'
            : passwordValidation.strength === 'medium'
              ? 'text-yellow-600'
              : 'text-red-600'
        }`}
      >
        {passwordValidation.strength}
      </span>
    </div>
  );

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <div className='w-full max-w-sm space-y-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Create your account
          </h1>
          <p className='text-muted-foreground text-sm'>
            Get started with Vector
          </p>
        </div>

        <form onSubmit={onSignUp} className='space-y-3' noValidate>
          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className='space-y-1.5'>
            <Label
              htmlFor='email'
              className='flex items-center gap-1.5 text-sm'
            >
              Email
              {statusIcon(emailValidation.isValid, email)}
            </Label>
            <Input
              id='email'
              type='email'
              placeholder='you@example.com'
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
              required
              autoFocus
            />
            {email && emailValidation.message && (
              <p className='text-xs text-red-600'>{emailValidation.message}</p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label
              htmlFor='username'
              className='flex items-center gap-1.5 text-sm'
            >
              Username
              {statusIcon(usernameValidation.isValid, username)}
            </Label>
            <Input
              id='username'
              type='text'
              placeholder='your-username'
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              required
            />
            {username && usernameValidation.message && (
              <p className='text-xs text-red-600'>
                {usernameValidation.message}
              </p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label
              htmlFor='password'
              className='flex items-center gap-1.5 text-sm'
            >
              Password
              {statusIcon(passwordValidation.isValid, password)}
            </Label>
            <div className='relative'>
              <Input
                id='password'
                type={showPassword ? 'text' : 'password'}
                placeholder='••••••••'
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
                className='text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs transition-colors'
                disabled={loading}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {password && passwordValidation.message && (
              <p className='text-xs text-red-600'>
                {passwordValidation.message}
              </p>
            )}
            {strengthBar}
          </div>

          <Button
            type='submit'
            className='w-full'
            size='sm'
            disabled={loading || !isFormValid}
          >
            {loading && <UserPlus className='mr-2 h-4 w-4 animate-spin' />}
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>

        <p className='text-muted-foreground text-center text-sm'>
          Already have an account?{' '}
          <Link
            href='/auth/login'
            className='text-foreground font-medium hover:underline'
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className='flex h-screen w-full items-center justify-center'>
          <div className='text-muted-foreground text-sm'>Loading...</div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
