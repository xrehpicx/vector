import { describe, expect, it } from 'vitest';

import { isMessageDue, retryDelayForAttempt } from './delivery-policy';

describe('message delivery policy', () => {
  it('uses bounded exponential retry delays', () => {
    expect(retryDelayForAttempt(0)).toBe(1_500);
    expect(retryDelayForAttempt(1)).toBe(4_000);
    expect(retryDelayForAttempt(2)).toBe(10_000);
    expect(retryDelayForAttempt(3)).toBeUndefined();
  });

  it('only delivers queued messages when their retry time is due', () => {
    expect(isMessageDue({ status: 'queued' }, 1_000)).toBe(true);
    expect(isMessageDue({ status: 'queued', retryAt: 999 }, 1_000)).toBe(true);
    expect(isMessageDue({ status: 'queued', retryAt: 1_001 }, 1_000)).toBe(
      false,
    );
    expect(isMessageDue({ status: 'sending' }, 1_000)).toBe(false);
    expect(isMessageDue({ status: 'failed' }, 1_000)).toBe(false);
  });
});
