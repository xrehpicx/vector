import type { NextRequest } from 'next/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { fetchAuthQuery } from '@/lib/auth-server';

interface RouteParams {
  attachmentId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const { attachmentId } = await params;
    const source = await fetchAuthQuery(
      api.collaboration.messages.getAttachmentUrl,
      {
        attachmentId: attachmentId as Id<'messageAttachments'>,
      },
    );
    if (!source) {
      return Response.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const forwardedHeaders = new Headers();
    for (const name of [
      'range',
      'if-range',
      'if-match',
      'if-none-match',
      'if-modified-since',
      'if-unmodified-since',
    ]) {
      const value = request.headers.get(name);
      if (value) forwardedHeaders.set(name, value);
    }
    const upstream = await fetch(source.url, {
      headers: forwardedHeaders,
      cache: 'no-store',
    });
    if (!upstream.ok && upstream.status !== 304) {
      return Response.json(
        { error: 'Attachment unavailable' },
        { status: 404 },
      );
    }

    const headers = new Headers();
    for (const name of [
      'accept-ranges',
      'content-length',
      'content-range',
      'content-type',
      'etag',
      'last-modified',
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    // Attachment IDs are immutable. A short private browser cache avoids
    // repeating the authenticated proxy round-trip as users switch channels,
    // while keeping responses out of shared caches.
    headers.set('cache-control', 'private, max-age=300');
    headers.set('vary', 'Cookie, Range');
    headers.set(
      'content-disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(source.attachment.name)}`,
    );
    headers.set('x-content-type-options', 'nosniff');

    return new Response(upstream.status === 304 ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return Response.json({ error: 'Attachment not found' }, { status: 404 });
  }
}
