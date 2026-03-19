import { NextResponse } from 'next/server';

export function GET() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? '';
  const tunnelHost = process.env.TUNNEL_HOST ?? '';

  return NextResponse.json({ convexUrl, tunnelHost });
}
