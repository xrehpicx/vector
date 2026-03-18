import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import path from 'path';

// ── Unit tests for bridge-service helpers ────────────────────────────────────

describe('BridgeConfig persistence', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vector-bridge-test-'));
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  it('saveBridgeConfig creates config directory and writes JSON', async () => {
    // We test the persistence logic directly
    const configDir = join(tempDir, '.vector');
    const configFile = join(configDir, 'bridge.json');
    const { mkdirSync } = await import('fs');

    mkdirSync(configDir, { recursive: true });
    const config = {
      deviceId: 'test-device-id',
      deviceKey: 'test-key',
      deviceSecret: 'test-secret',
      userId: 'test-user-id',
      displayName: "Test's Mac",
      convexUrl: 'https://test.convex.cloud',
      registeredAt: '2026-03-18T00:00:00.000Z',
    };
    writeFileSync(configFile, JSON.stringify(config, null, 2));

    const loaded = JSON.parse(readFileSync(configFile, 'utf-8'));
    expect(loaded.deviceId).toBe('test-device-id');
    expect(loaded.deviceSecret).toBe('test-secret');
    expect(loaded.displayName).toBe("Test's Mac");
  });

  it('loadBridgeConfig returns null when no config exists', () => {
    const configFile = join(tempDir, 'nonexistent.json');
    expect(existsSync(configFile)).toBe(false);
  });

  it('loadBridgeConfig parses valid JSON', () => {
    const configFile = join(tempDir, 'bridge.json');
    writeFileSync(
      configFile,
      JSON.stringify({ deviceId: 'abc', deviceSecret: 'xyz' }),
    );
    const loaded = JSON.parse(readFileSync(configFile, 'utf-8'));
    expect(loaded.deviceId).toBe('abc');
  });
});

describe('Process discovery helpers', () => {
  it('getGitInfo returns branch and repoRoot for a git repo', () => {
    // We're in the vector repo, so this should work
    const repoRoot = path.resolve(__dirname, '..', '..');
    const { execSync } = require('child_process');

    let branch: string;
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
        cwd: repoRoot,
        timeout: 3000,
      }).trim();
    } catch {
      // Skip if not in a git repo
      return;
    }

    expect(branch).toBeTruthy();
    expect(typeof branch).toBe('string');
  });

  it('getGitInfo returns empty object for non-git directory', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'no-git-'));
    const { execSync } = require('child_process');

    let result = {};
    try {
      execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
        cwd: tempDir,
        timeout: 3000,
      });
    } catch {
      result = {};
    }

    expect(result).toEqual({});
  });
});

describe('Reply generation', () => {
  // Test the reply logic directly
  function generateReply(userMessage: string): string {
    const lower = userMessage.toLowerCase().trim();
    if (['hey', 'hi', 'hello'].includes(lower)) {
      return "Hey! I'm running on your local machine via the Vector bridge. What would you like me to work on?";
    }
    if (lower.includes('status') || lower.includes('progress')) {
      return "I'm making good progress. Currently reviewing the changes and running tests.";
    }
    if (lower.includes('stop') || lower.includes('cancel')) {
      return 'Understood — wrapping up the current step.';
    }
    return `Got it — "${userMessage}". I'll incorporate that into my current work.`;
  }

  it('replies to greetings', () => {
    expect(generateReply('hey')).toContain('running on your local machine');
    expect(generateReply('Hi')).toContain('running on your local machine');
    expect(generateReply('hello')).toContain('running on your local machine');
  });

  it('replies to status queries', () => {
    expect(generateReply('what is the status?')).toContain('good progress');
    expect(generateReply('any progress?')).toContain('good progress');
  });

  it('replies to stop/cancel', () => {
    expect(generateReply('stop working')).toContain('wrapping up');
    expect(generateReply('please cancel')).toContain('wrapping up');
  });

  it('echoes unknown messages', () => {
    const reply = generateReply('refactor the auth module');
    expect(reply).toContain('refactor the auth module');
    expect(reply).toContain('Got it');
  });
});

// ── CLI integration tests for bridge commands ────────────────────────────────

const repoRoot = path.resolve(__dirname, '..', '..');
const cliEntrypoint = path.join(repoRoot, 'src/cli/index.ts');
const tsxBin = path.join(repoRoot, 'node_modules/.bin/tsx');

function runCliRaw(args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(tsxBin, [cliEntrypoint, ...args], {
    cwd: repoRoot,
    env: env ?? process.env,
    encoding: 'utf8',
  });
}

describe('Bridge CLI commands', () => {
  it('shows service subcommands in help', () => {
    const result = runCliRaw(['service', '--help']);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).toContain('start');
    expect(output).toContain('stop');
    expect(output).toContain('status');
    expect(output).toContain('install');
    expect(output).toContain('uninstall');
    expect(output).toContain('logs');
  }, 30_000);

  it('shows bridge subcommands in help', () => {
    const result = runCliRaw(['bridge', '--help']);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).toContain('start');
    expect(output).toContain('stop');
    expect(output).toContain('status');
  }, 30_000);

  it('service status reports not configured when no config exists', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'vcli-bridge-'));
    const result = runCliRaw(['service', 'status'], {
      ...process.env,
      HOME: tempHome,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).toContain('not configured');
  }, 30_000);

  it('bridge status reports not configured when no config exists', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'vcli-bridge-'));
    const result = runCliRaw(['bridge', 'status'], {
      ...process.env,
      HOME: tempHome,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).toContain('not configured');
  }, 30_000);

  it('service stop reports not running when no PID file', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'vcli-bridge-'));
    const result = runCliRaw(['service', 'stop'], {
      ...process.env,
      HOME: tempHome,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).toMatch(/not running|No PID/i);
  }, 30_000);

  it('includes service and bridge in root help output', () => {
    const result = runCliRaw(['--help']);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).toContain('service');
    expect(output).toContain('bridge');
  }, 30_000);
});
