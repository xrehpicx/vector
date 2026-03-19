# Environment Variables

Vector does not have a single centralized env system today. The current implementation reads environment variables in three places:

1. Next.js app code uses Next.js env injection, and `src/env.ts` manually mirrors Next.js `.env*` load order when that module is imported.
2. Convex functions and actions in `convex/*` read `process.env` directly.
3. The Vector CLI loads `.env.local` and `.env` with `dotenv` for local defaults.

For local development, a single root `.env.local` is still enough because both Next.js and local Convex development can read it. In production, split variables by the runtime that actually reads them.

## Local Setup (`.env.local`)

For local development, create a `.env.local` file in the root of the project. You can start by copying `sample.env`.

```bash
cp sample.env .env.local
```

## How Loading Works

### Next.js App

- Next.js handles browser and server env injection for app code.
- If a server module imports `src/env.ts`, that file manually loads `.env.${NODE_ENV}.local`, `.env.local`, `.env.${NODE_ENV}`, then `.env`, with first match winning.
- `src/env.ts` only validates `NODE_ENV` and the `SMTP_*` variables today. Most app variables are still read directly from `process.env`.

### Convex Runtime

- Files under `convex/*` do not import `src/env.ts`.
- They read `process.env` directly inside the Convex runtime, so those values must exist in the Convex environment for the deployment you are running.

### CLI / Scripts

- `packages/vector-cli/src/index.ts` loads `.env.local` first and `.env` second.
- That CLI loader does not mirror the full Next.js `.env*` precedence list.
- Standalone scripts under `scripts/*` read `process.env` directly.

Some variables appear in more than one section below because more than one runtime reads them.

## Runtime Breakdown

### Set In Next.js Environment (`.env.local`, Vercel)

| Variable                       | Confirmed usage                                                                                                                                                                         | Example                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_CONVEX_URL`       | Read by `src/providers/*`, `src/lib/convex-server.ts`, `src/lib/auth-server.ts`, `src/lib/branding.server.ts`, `src/app/api/config/route.ts`, and `src/app/api/files/[...key]/route.ts` | `http://127.0.0.1:3210` |
| `CONVEX_SITE_URL`              | Read by `src/lib/auth-server.ts` on the Next.js server                                                                                                                                  | `http://127.0.0.1:3211` |
| `NEXT_PUBLIC_CONVEX_SITE_URL`  | Fallback read by `src/lib/auth-server.ts`; also used by `src/components/organization/github-integration-settings.tsx` to build the webhook URL                                          | `http://127.0.0.1:3211` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Read by `src/lib/notifications.ts` in the browser                                                                                                                                       | `your_vapid_public_key` |

### Set In Convex Environment

| Variable                      | Confirmed usage                                                                                                      | Example                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `BETTER_AUTH_SECRET`          | Read by `convex/auth.ts` for Better Auth secrets; also used as a fallback encryption seed in `convex/github/node.ts` | `replace-with-a-long-random-secret` |
| `AUTH_SECRET`                 | Legacy fallback alias for `BETTER_AUTH_SECRET` in `convex/auth.ts` and `convex/github/node.ts`                       | `replace-with-a-long-random-secret` |
| `NEXT_PUBLIC_APP_URL`         | Read by `convex/auth.ts` for Better Auth base URL and by `convex/notifications/actions.ts` for absolute email links  | `http://localhost:3000`             |
| `NEXT_PUBLIC_SITE_URL`        | Legacy fallback alias for `NEXT_PUBLIC_APP_URL` in `convex/auth.ts`                                                  | `http://localhost:3000`             |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Read by `convex/auth.ts` for trusted callback origins                                                                | `http://localhost:3000`             |
| `GITHUB_CLIENT_ID`            | Optional GitHub OAuth provider config in `convex/auth.ts`                                                            | `your_github_oauth_client_id`       |
| `GITHUB_CLIENT_SECRET`        | Optional GitHub OAuth provider config in `convex/auth.ts`                                                            | `your_github_oauth_client_secret`   |
| `SMTP_HOST`                   | Read by `convex/email/otp.ts` and `convex/notifications/actions.ts` for email delivery                               | `smtp.resend.com`                   |
| `SMTP_PORT`                   | Read by `convex/email/otp.ts` and `convex/notifications/actions.ts` for email delivery                               | `465`                               |
| `SMTP_USER`                   | Read by `convex/email/otp.ts` and `convex/notifications/actions.ts` for email delivery                               | `resend`                            |
| `SMTP_PASS`                   | Read by `convex/email/otp.ts` and `convex/notifications/actions.ts` for email delivery                               | `your_resend_api_key`               |
| `SMTP_FROM`                   | Read by `convex/email/otp.ts` and `convex/notifications/actions.ts` for email delivery                               | `"Vector" <noreply@example.com>`    |
| `VAPID_PUBLIC_KEY`            | Read by `convex/notifications/actions.ts` for push delivery                                                          | `your_vapid_public_key`             |
| `VAPID_PRIVATE_KEY`           | Read by `convex/notifications/actions.ts` for push delivery                                                          | `your_vapid_private_key`            |
| `VAPID_SUBJECT`               | Read by `convex/notifications/actions.ts` for push delivery                                                          | `mailto:notifications@example.com`  |
| `OPENROUTER_API_KEY`          | Read by `convex/ai/provider.ts` and GitHub AI flows in `convex/github/actions.ts`                                    | `your_openrouter_api_key`           |
| `OPENROUTER_MODEL`            | Optional assistant model override in `convex/ai/provider.ts`                                                         | `moonshotai/kimi-k2.5:nitro`        |
| `GITHUB_APP_ID`               | Optional GitHub App integration in `convex/github/node.ts`                                                           | `123456`                            |
| `GITHUB_APP_PRIVATE_KEY`      | Optional GitHub App private key in `convex/github/node.ts`                                                           | `-----BEGIN PRIVATE KEY-----...`    |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Optional encryption key for stored GitHub fallback tokens in `convex/github/node.ts`                                 | `replace-with-a-random-secret`      |

`NEXT_PUBLIC_APP_URL` looks like a frontend variable, but the current code reads it inside Convex code. The `NEXT_PUBLIC_` prefix does not tell you which runtime owns the variable in this codebase.

### Minimum Local Setup

If you only want the app running locally, start with:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000
BETTER_AUTH_SECRET=<your-secret>
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
CONVEX_SITE_URL=http://127.0.0.1:3211
NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211
```

Optional locally:

- SMTP variables for real email delivery
- VAPID variables for browser push notifications
- `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL` for the assistant
- GitHub OAuth and GitHub App variables if you are testing GitHub integration
- `CONVEX_URL` and `CONVEX_ADMIN_KEY` for migration scripts and CLI-only workflows

### Local CLI / Convex Tooling Only

| Variable                 | Confirmed usage                                                                                                                 | Example                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_APP_URL`    | Used by `packages/vector-cli/src/index.ts` as the fallback `--app-url`                                                          | `http://localhost:3000` |
| `NEXT_PUBLIC_CONVEX_URL` | Used by `packages/vector-cli/src/index.ts` as a fallback Convex URL after trying the app config endpoint                        | `http://127.0.0.1:3210` |
| `CONVEX_URL`             | Read by `packages/vector-cli/src/index.ts`, `scripts/run-permission-migrations.ts`, and `scripts/backfill-issue-search-text.ts` | `http://127.0.0.1:3210` |
| `CONVEX_ADMIN_KEY`       | Read by `scripts/run-permission-migrations.ts` and `scripts/backfill-issue-search-text.ts`                                      | `your_admin_key`        |
| `VECTOR_HOME`            | Overrides the CLI profile/session storage directory                                                                             | `/path/to/.vector`      |
| `CONVEX_DEPLOYMENT`      | Managed by the Convex CLI, not read by application code                                                                         | auto-set by `convex`    |

## Adding New Variables

1. Add the variable to the runtime code that uses it.
2. Put it in the env for the runtime that reads it. Do not assume the `NEXT_PUBLIC_` prefix tells you the deployment target.
3. If the variable should be validated centrally in Next.js-only code, add it to `src/env.ts`.
4. Add it to `sample.env` with a safe local placeholder.
5. Update this documentation.
