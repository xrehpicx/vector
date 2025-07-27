import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";

// Define route matchers
const isAuthPage = createRouteMatcher(["/auth/login", "/auth/signup"]);
const isSetupPage = createRouteMatcher(["/setup-admin", "/org-setup"]);
const isProtectedRoute = createRouteMatcher([
  "/[orgSlug]/(main)/dashboard(.*)",
  "/[orgSlug]/(main)/teams(.*)",
  "/[orgSlug]/(main)/projects(.*)",
  "/[orgSlug]/(main)/issues(.*)",
  "/[orgSlug]/(main)/settings(.*)",
  "/settings/profile(.*)",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const { pathname } = request.nextUrl;

  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (isAuthPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }

  // If user is authenticated and trying to access setup pages, redirect to dashboard
  if (isSetupPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }

  // If user is not authenticated and trying to access protected routes, redirect to login
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Special case for setup-admin: check if admin exists
  if (pathname === "/setup-admin") {
    try {
      const res = await fetch(new URL("/api/system/has-admin", request.url), {
        headers: { "x-internal": "true" },
        next: { revalidate: 60 }, // cache for a minute at edge
      });

      if (res.ok) {
        const data: { hasAdmin: boolean } = await res.json();
        if (data.hasAdmin) {
          // Admin exists, redirect to login
          return nextjsMiddlewareRedirect(request, "/auth/login");
        }
      }
    } catch (error) {
      // If the API call fails, allow access to setup-admin
      console.warn("Failed to check admin existence:", error);
    }
  }

  return NextResponse.next();
});

// Exclude Next.js internals and static assets from running this middleware.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
