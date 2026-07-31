export const RETRY_DELAYS_MS = [1_500, 4_000, 10_000] as const;

export function retryDelayForAttempt(attemptsBeforeSend: number) {
  return RETRY_DELAYS_MS[attemptsBeforeSend];
}

export function isMessageDue(
  message: { status: string; retryAt?: number },
  now = Date.now(),
) {
  return (
    message.status === 'queued' && (!message.retryAt || message.retryAt <= now)
  );
}
