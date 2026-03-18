import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { authComponent, createAuth } from './auth';
import {
  setup as bridgeSetup,
  heartbeat as bridgeHeartbeat,
  commands as bridgeCommands,
  completeCommand as bridgeCompleteCommand,
  postMessage as bridgePostMessage,
  reportProcess as bridgeReportProcess,
} from './agentBridge/httpEndpoints';

const http = httpRouter();

http.route({
  path: '/webhooks/github',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const url = new URL(request.url);
    await ctx.runAction(internal.github.actions.processWebhook, {
      body,
      event: request.headers.get('x-github-event') ?? 'unknown',
      deliveryId: request.headers.get('x-github-delivery') ?? undefined,
      orgSlug: url.searchParams.get('org') ?? undefined,
      signature: request.headers.get('x-hub-signature-256') ?? undefined,
    });

    return new Response('ok', { status: 200 });
  }),
});

// ── Agent Bridge HTTP endpoints ──────────────────────────────────────────────

http.route({ path: '/api/bridge/setup', method: 'POST', handler: bridgeSetup });
http.route({
  path: '/api/bridge/heartbeat',
  method: 'POST',
  handler: bridgeHeartbeat,
});
http.route({
  path: '/api/bridge/commands',
  method: 'GET',
  handler: bridgeCommands,
});
http.route({
  path: '/api/bridge/command/complete',
  method: 'POST',
  handler: bridgeCompleteCommand,
});
http.route({
  path: '/api/bridge/message',
  method: 'POST',
  handler: bridgePostMessage,
});
http.route({
  path: '/api/bridge/process',
  method: 'POST',
  handler: bridgeReportProcess,
});

authComponent.registerRoutes(http, createAuth, {
  cors: true,
});

export default http;
