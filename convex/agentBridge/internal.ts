import { internalMutation } from '../_generated/server';

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

        // Cascade: disconnect only ACTIVE processes (use status index)
        const processes = await ctx.db
          .query('agentProcesses')
          .withIndex('by_device_status', q =>
            q.eq('deviceId', device._id).eq('status', 'observed'),
          )
          .take(100);

        for (const proc of processes) {
          await ctx.db.patch('agentProcesses', proc._id, {
            status: 'disconnected',
            endedAt: now,
          });
        }

        // Cascade: disconnect active live activities (only non-ended ones)
        const activities = await ctx.db
          .query('issueLiveActivities')
          .withIndex('by_device', q => q.eq('deviceId', device._id))
          .take(50);

        for (const activity of activities) {
          if (activity.endedAt) continue;

          await ctx.db.patch('issueLiveActivities', activity._id, {
            status: 'disconnected',
            lastEventAt: now,
            endedAt: now,
          });

          // Also disconnect the linked work session
          if (activity.workSessionId) {
            const ws = await ctx.db.get('workSessions', activity.workSessionId);
            if (ws && !ws.endedAt) {
              await ctx.db.patch('workSessions', activity.workSessionId, {
                status: 'disconnected',
                lastEventAt: now,
                endedAt: now,
              });
            }
          }
        }

        // Expire pending commands (already uses status index)
        const commands = await ctx.db
          .query('agentCommands')
          .withIndex('by_device_status', q =>
            q.eq('deviceId', device._id).eq('status', 'pending'),
          )
          .take(100);

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
