import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerVersion } from './version';

describe('semantic version ordering', () => {
  it('orders stable releases and prereleases correctly', () => {
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0-beta.112.1')).toBe(true);
    expect(isNewerVersion('0.1.0-beta.112.1', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false);
    expect(compareVersions('1.2.3-beta.10', '1.2.3-beta.9')).toBeGreaterThan(0);
  });

  it('does not treat invalid registry output as an update', () => {
    expect(isNewerVersion('not-a-version', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.1', 'dotenv banner\n0.1.0')).toBe(false);
  });
});
