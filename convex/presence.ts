/**
 * Root presence API used by @convex-dev/presence/react.
 *
 * The package's unload beacon intentionally targets `presence:disconnect`,
 * so keep this public path stable even though the authorization and room
 * validation implementation lives with the collaboration domain.
 */
export {
  channelRoomId,
  disconnect,
  heartbeat,
  list,
  updateData,
} from './collaboration/presence';
