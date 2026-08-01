import { NextResponse } from 'next/server';

export function GET() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? '';
  const convexSiteUrl =
    process.env.CONVEX_SITE_URL ??
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
    convexUrl;
  const tunnelHost = process.env.TUNNEL_HOST ?? '';

  return NextResponse.json({ convexSiteUrl, convexUrl, tunnelHost });
}
