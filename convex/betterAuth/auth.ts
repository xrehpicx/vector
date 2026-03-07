import { convexAdapter } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import authConfig from '../auth.config';

const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ||
  process.env.AUTH_SECRET ||
  'dev-only-better-auth-secret-change-me';

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000';

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  trustedOrigins: [getBaseUrl()],
  secret: betterAuthSecret,
  database: convexAdapter({} as never, {} as never),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  user: {
    additionalFields: {
      userId: {
        type: 'string',
        required: false,
      },
    },
  },
  plugins: [
    username(),
    convex({
      authConfig,
      jwksRotateOnTokenGenerationError: true,
    }),
  ],
});
