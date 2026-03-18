/**
 * HTTP action handlers for the local bridge.
 * These authenticate via deviceKey + deviceSecret, not user sessions.
 */
import { httpAction } from '../_generated/server';
import { internal } from '../_generated/api';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ── POST /api/bridge/setup ──────────────────────────────────────────────────
// First-time device registration. Requires a one-time setup token (userId).
// In production, this would use a device code flow.

export const setup = httpAction(async (ctx, request) => {
  const body = await request.json();
  const {
    userId,
    deviceKey,
    deviceSecret,
    displayName,
    hostname,
    platform,
    serviceType,
    cliVersion,
    capabilities,
  } = body as {
    userId: string;
    deviceKey: string;
    deviceSecret: string;
    displayName: string;
    hostname?: string;
    platform?: string;
    serviceType?: string;
    cliVersion?: string;
    capabilities?: string[];
  };

  if (!userId || !deviceKey || !deviceSecret || !displayName) {
    return errorResponse(
      'Missing required fields: userId, deviceKey, deviceSecret, displayName',
    );
  }

  const result = await ctx.runMutation(
    internal.agentBridge.bridgeAuth.setupDevice,
    {
      userId,
      deviceKey,
      deviceSecret,
      displayName,
      hostname,
      platform,
      serviceType: serviceType ?? 'foreground',
      cliVersion,
      capabilities,
    },
  );

  return jsonResponse(result);
});

// ── POST /api/bridge/heartbeat ──────────────────────────────────────────────

export const heartbeat = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { deviceId, deviceSecret } = body as {
    deviceId: string;
    deviceSecret: string;
  };

  if (!deviceId || !deviceSecret) {
    return errorResponse('Missing deviceId or deviceSecret');
  }

  const result = await ctx.runMutation(
    internal.agentBridge.bridgeAuth.heartbeat,
    { deviceId, deviceSecret },
  );

  if (!result.ok) return errorResponse(result.error ?? 'Unauthorized', 401);
  return jsonResponse({ ok: true });
});

// ── GET /api/bridge/commands?deviceId=...&deviceSecret=... ──────────────────

export const commands = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId');
  const deviceSecret = url.searchParams.get('deviceSecret');

  if (!deviceId || !deviceSecret) {
    return errorResponse('Missing deviceId or deviceSecret');
  }

  const result = await ctx.runQuery(
    internal.agentBridge.bridgeAuth.getPendingCommands,
    { deviceId, deviceSecret },
  );

  if (!result.ok) return errorResponse(result.error ?? 'Unauthorized', 401);
  return jsonResponse({ commands: result.commands });
});

// ── POST /api/bridge/command/complete ───────────────────────────────────────

export const completeCommand = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { deviceSecret, commandId, status } = body as {
    deviceSecret: string;
    commandId: string;
    status: 'delivered' | 'failed';
  };

  if (!deviceSecret || !commandId || !status) {
    return errorResponse('Missing required fields');
  }

  const result = await ctx.runMutation(
    internal.agentBridge.bridgeAuth.completeCommand,
    { deviceSecret, commandId, status },
  );

  if (!result.ok) return errorResponse(result.error ?? 'Unauthorized', 401);
  return jsonResponse({ ok: true });
});

// ── POST /api/bridge/message ────────────────────────────────────────────────

export const postMessage = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { deviceSecret, liveActivityId, role, messageBody } = body as {
    deviceSecret: string;
    liveActivityId: string;
    role: 'status' | 'assistant';
    messageBody: string;
  };

  if (!deviceSecret || !liveActivityId || !messageBody) {
    return errorResponse('Missing required fields');
  }

  const result = await ctx.runMutation(
    internal.agentBridge.bridgeAuth.postAgentMessage,
    {
      deviceSecret,
      liveActivityId,
      role: role ?? 'assistant',
      body: messageBody,
    },
  );

  if (!result.ok) return errorResponse(result.error ?? 'Unauthorized', 401);
  return jsonResponse({ ok: true, messageId: result.messageId });
});

// ── POST /api/bridge/process ────────────────────────────────────────────────

export const reportProcess = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { deviceSecret, deviceId, ...processData } = body as {
    deviceSecret: string;
    deviceId: string;
    provider: string;
    providerLabel?: string;
    sessionKey?: string;
    cwd?: string;
    repoRoot?: string;
    branch?: string;
    title?: string;
    model?: string;
    mode: string;
    status: string;
    supportsInboundMessages: boolean;
  };

  if (!deviceSecret || !deviceId) {
    return errorResponse('Missing deviceSecret or deviceId');
  }

  const result = await ctx.runMutation(
    internal.agentBridge.bridgeAuth.reportProcess,
    { deviceSecret, deviceId, ...processData },
  );

  if (!result.ok) return errorResponse(result.error ?? 'Unauthorized', 401);
  return jsonResponse({ ok: true, processId: result.processId });
});
