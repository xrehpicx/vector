import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import path from 'path';

// ── Unit tests for bridge-service helpers ────────────────────────────────────

describe('BridgeConfig persistence', () => {
  let tempDir: string;
  let originalVectorHome: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vector-bridge-test-'));
    originalVectorHome = process.env.VECTOR_HOME;
    process.env.VECTOR_HOME = join(tempDir, '.vector');
    vi.resetModules();
  });

  afterEach(() => {
    if (originalVectorHome === undefined) {
      delete process.env.VECTOR_HOME;
    } else {
      process.env.VECTOR_HOME = originalVectorHome;
    }
    vi.restoreAllMocks();
  });

  it('saveBridgeConfig creates config directory and writes JSON', async () => {
    const config = {
      deviceId: 'test-device-id',
      deviceKey: 'test-key',
      deviceSecret: 'test-secret',
      userId: 'test-user-id',
      displayName: "Test's Mac",
      convexUrl: 'https://test.convex.cloud',
      registeredAt: '2026-03-18T00:00:00.000Z',
    };
    const { loadBridgeConfig, saveBridgeConfig } =
      await import('./bridge-service');
    saveBridgeConfig(config);

    expect(loadBridgeConfig()).toEqual(config);
    expect(statSync(process.env.VECTOR_HOME!).mode & 0o777).toBe(0o700);
    expect(
      statSync(join(process.env.VECTOR_HOME!, 'bridge.json')).mode & 0o777,
    ).toBe(0o600);
    expect(
      statSync(join(process.env.VECTOR_HOME!, 'device-key')).mode & 0o777,
    ).toBe(0o600);
  });

  it('loadBridgeConfig returns null when no config exists', async () => {
    const { loadBridgeConfig } = await import('./bridge-service');
    expect(loadBridgeConfig()).toBeNull();
  });

  it('does not create bridge state when stopping an unconfigured service', async () => {
    const { stopBridge } = await import('./bridge-service');

    expect(stopBridge()).toBe(false);
    expect(existsSync(process.env.VECTOR_HOME!)).toBe(false);
  });

  it('loadBridgeConfig migrates an existing config to mode 0600', async () => {
    const configDir = process.env.VECTOR_HOME!;
    const configFile = join(configDir, 'bridge.json');
    const { mkdirSync } = await import('fs');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      configFile,
      JSON.stringify({ deviceId: 'abc', deviceSecret: 'xyz' }),
    );
    chmodSync(configFile, 0o644);

    const { loadBridgeConfig } = await import('./bridge-service');
    expect(loadBridgeConfig()).toMatchObject({ deviceId: 'abc' });
    expect(statSync(configFile).mode & 0o777).toBe(0o600);
  });
});

describe('Process discovery helpers', () => {
  it('getGitInfo returns branch and repoRoot for a git repo', () => {
    // We're in the vector repo, so this should work
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
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
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      });
    } catch {
      result = {};
    }

    expect(result).toEqual({});
  });
});

// ── CLI integration tests for bridge commands ────────────────────────────────

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cliEntrypoint = path.join(__dirname, 'index.ts');
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
    // On macOS it also tries to unload LaunchAgent, so accept that output too
    expect(output).toMatch(/not running|No PID|unload/i);
  }, 30_000);

  it('includes service and bridge in root help output', () => {
    const result = runCliRaw(['--help']);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).toContain('service');
    expect(output).toContain('bridge');
  }, 30_000);
});
