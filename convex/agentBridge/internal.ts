import { internalMutation, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import { AGENT_PROVIDER_LABELS } from '../_shared/agentBridge';

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── Staleness Cron ──────────────────────────────────────────────────────────

/** Mark stale/offline devices and cascade to processes and live activities. */
export const markStaleDevices = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();
    let staleCount = 0;
    let offlineCount = 0;

    // Mark online devices as stale if no heartbeat in 2 minutes
    const onlineDevices = await ctx.db
      .query('agentDevices')
      .withIndex('by_status', q => q.eq('status', 'online'))
      .collect();

    for (const device of onlineDevices) {
      if (now - device.lastSeenAt > STALE_THRESHOLD_MS) {
        await ctx.db.patch('agentDevices', device._id, {
          status: 'stale',
          updatedAt: now,
        });
        staleCount++;
      }
    }

    // Mark stale devices as offline if no heartbeat in 5 minutes
    const staleDevices = await ctx.db
      .query('agentDevices')
      .withIndex('by_status', q => q.eq('status', 'stale'))
      .collect();

    for (const device of staleDevices) {
      if (now - device.lastSeenAt > OFFLINE_THRESHOLD_MS) {
        await ctx.db.patch('agentDevices', device._id, {
          status: 'offline',
          updatedAt: now,
        });
        offlineCount++;

        // Cascade: disconnect running processes on this device
        const processes = await ctx.db
          .query('agentProcesses')
          .withIndex('by_device', q => q.eq('deviceId', device._id))
          .collect();

        for (const proc of processes) {
          if (!proc.endedAt) {
            await ctx.db.patch('agentProcesses', proc._id, {
              status: 'disconnected',
              endedAt: now,
            });
          }
        }

        // Cascade: disconnect active live activities on this device
        const activities = await ctx.db
          .query('issueLiveActivities')
          .withIndex('by_device', q => q.eq('deviceId', device._id))
          .collect();

        for (const activity of activities) {
          if (!activity.endedAt) {
            await ctx.db.patch('issueLiveActivities', activity._id, {
              status: 'disconnected',
              lastEventAt: now,
              endedAt: now,
            });
          }
        }

        // Expire pending commands for offline device
        const commands = await ctx.db
          .query('agentCommands')
          .withIndex('by_device_status', q =>
            q.eq('deviceId', device._id).eq('status', 'pending'),
          )
          .collect();

        for (const cmd of commands) {
          await ctx.db.patch('agentCommands', cmd._id, {
            status: 'expired',
            completedAt: now,
          });
        }
      }
    }

    return { staleCount, offlineCount };
  },
});

// ── Simulated Bridge (for dev/demo) ─────────────────────────────────────────

/** Simulated bridge reply — processes a pending command and sends a response. */
export const simulateBridgeReply = internalMutation({
  args: {
    commandId: v.id('agentCommands'),
    liveActivityId: v.id('issueLiveActivities'),
  },
  handler: async (ctx, args) => {
    const cmd = await ctx.db.get('agentCommands', args.commandId);
    if (!cmd || cmd.status !== 'pending') return;

    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity) return;

    const now = Date.now();

    // Mark command as delivered
    await ctx.db.patch('agentCommands', args.commandId, {
      status: 'delivered',
      claimedAt: now,
      completedAt: now,
    });

    // Mark the outbound message as delivered
    const messages = await ctx.db
      .query('issueLiveMessages')
      .withIndex('by_live_activity_created', q =>
        q.eq('liveActivityId', args.liveActivityId),
      )
      .collect();

    const pendingUserMsg = messages
      .filter(
        m =>
          m.direction === 'vector_to_agent' && m.deliveryStatus === 'pending',
      )
      .pop();

    if (pendingUserMsg) {
      await ctx.db.patch('issueLiveMessages', pendingUserMsg._id, {
        deliveryStatus: 'delivered',
      });
    }

    // Generate a simulated agent response
    const userMessage = (cmd.payload as { body?: string })?.body ?? '';
    const providerLabel =
      AGENT_PROVIDER_LABELS[activity.provider] ?? activity.provider;
    const reply = generateSimulatedReply(userMessage, providerLabel);

    // Post the agent reply
    await ctx.db.insert('issueLiveMessages', {
      liveActivityId: args.liveActivityId,
      direction: 'agent_to_vector',
      role: 'assistant',
      body: reply,
      deliveryStatus: 'sent',
      createdAt: now,
    });

    // Update live activity
    await ctx.db.patch('issueLiveActivities', args.liveActivityId, {
      lastEventAt: now,
      latestSummary: reply.length > 80 ? reply.slice(0, 77) + '...' : reply,
    });
  },
});

function generateSimulatedReply(
  userMessage: string,
  providerLabel: string,
): string {
  const lower = userMessage.toLowerCase().trim();

  if (lower === 'hey' || lower === 'hi' || lower === 'hello') {
    return `Hey! I'm currently working on this issue. What would you like me to focus on?`;
  }
  if (lower.includes('status') || lower.includes('progress')) {
    return `I'm making good progress. Currently reviewing the changes and running tests. I'll update the summary when the next milestone is complete.`;
  }
  if (lower.includes('stop') || lower.includes('cancel')) {
    return `Understood — I'll wrap up the current step and stop. You can check the latest changes in the working directory.`;
  }
  return `Got it — "${userMessage}". I'll incorporate that into my current work on this issue.`;
}

/** Schedule a bridge reply (called from appendLiveMessage). */
export const scheduleBridgeReply = internalAction({
  args: {
    commandId: v.id('agentCommands'),
    liveActivityId: v.id('issueLiveActivities'),
  },
  handler: async (ctx, args) => {
    // Wait 2 seconds to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    await ctx.runMutation(internal.agentBridge.internal.simulateBridgeReply, {
      commandId: args.commandId,
      liveActivityId: args.liveActivityId,
    });
  },
});
