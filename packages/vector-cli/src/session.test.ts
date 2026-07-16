import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEmptySession,
  getSessionPath,
  listProfiles,
  writeDefaultProfile,
  writeSession,
} from './session';

describe('CLI session storage', () => {
  const originalVectorHome = process.env.VECTOR_HOME;
  let vectorHome: string;

  beforeEach(() => {
    vectorHome = path.join(
      mkdtempSync(path.join(tmpdir(), 'vcli-session-')),
      '.vector',
    );
    process.env.VECTOR_HOME = vectorHome;
  });

  afterEach(() => {
    if (originalVectorHome === undefined) {
      delete process.env.VECTOR_HOME;
    } else {
      process.env.VECTOR_HOME = originalVectorHome;
    }
  });

  it('stores the directory privately and credential files with mode 0600', async () => {
    await writeSession(
      { ...createEmptySession(), bearerToken: 'secret-token' },
      'work',
    );
    await writeDefaultProfile('work');

    expect(statSync(vectorHome).mode & 0o777).toBe(0o700);
    expect(statSync(getSessionPath('work')).mode & 0o777).toBe(0o600);
    expect(
      statSync(path.join(vectorHome, 'cli-config.json')).mode & 0o777,
    ).toBe(0o600);
    expect((await listProfiles()).map(profile => profile.name)).toEqual([
      'work',
    ]);
  });

  it('rejects profile names that can escape the session directory', () => {
    expect(() => getSessionPath('../outside')).toThrow(/Profile name/);
    expect(() => getSessionPath('work/team')).toThrow(/Profile name/);
  });

  it('rejects a relative VECTOR_HOME instead of writing into the cwd', () => {
    process.env.VECTOR_HOME = 'undefined';
    expect(() => getSessionPath()).toThrow(/absolute path/);
  });
});
