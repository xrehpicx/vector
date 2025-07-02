import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/auth/auth";
import { db } from "@/db";
import { clearPermissionCache } from "@/auth/permissions";

/**
 * Build the tRPC context for every request.
 * We fetch the BetterAuth session (if any) once per request and reuse it across
 * all resolvers (thanks to `react/cache`).  You can extend this with
 * additional per-request data — e.g. Prisma/Drizzle transaction, headers, etc.
 */
export const createTRPCContext = async (opts: { req: Request }) => {
  // Clear permission cache at the start of each request
  clearPermissionCache();

  // Better Auth needs the request headers to resolve the session
  const session = await auth.api.getSession({ headers: opts.req.headers });

  return {
    db,
    session,
  };
};

// ---------------------------------------------------------------------------
// tRPC bootstrap — wire the Context to the router/procedure helpers
// ---------------------------------------------------------------------------
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// Type for context with guaranteed session (used in protected procedures)
export type ProtectedContext = Context & {
  session: NonNullable<Context["session"]>;
};

const t = initTRPC.context<Context>().create();

/**
 * Helper factories re-exported for router/procedure creation.
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure that ensures session exists and properly types the context.
 * After this middleware, ctx.session is guaranteed to be non-null.
 */
export const protectedProcedure = t.procedure.use(async ({ next, ctx }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Type assertion here is safe because we just checked above
  return next({
    ctx: ctx as ProtectedContext,
  });
});

/**
 * Helper to get user ID from protected context.
 * Only use this in protected procedures where session is guaranteed.
 */
export function getUserId(ctx: ProtectedContext): string {
  return ctx.session.user.id;
}
