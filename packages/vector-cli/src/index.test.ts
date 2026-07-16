import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cliEntrypoint = path.join(__dirname, 'index.ts');
const tsxBin = path.join(repoRoot, 'node_modules/.bin/tsx');

function runCliRaw(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = spawnSync(tsxBin, [cliEntrypoint, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
  });

  return result;
}

function runCli(args: string[]) {
  const result = runCliRaw(args);

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (result.status !== 0) {
    throw new Error(
      [
        `CLI command failed: vcli ${args.join(' ')}`,
        `exit code: ${String(result.status)}`,
        stdout && `stdout:\n${stdout}`,
        stderr && `stderr:\n${stderr}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  return `${stdout}\n${stderr}`;
}

describe('Vector CLI command surface', () => {
  it('keeps version and JSON output machine-readable when dotenv files exist', () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'vcli-output-'));
    writeFileSync(
      path.join(tempRoot, '.env'),
      'NEXT_PUBLIC_APP_URL=http://127.0.0.1:9\n',
    );

    const env = {
      ...process.env,
      VECTOR_HOME: path.join(tempRoot, '.vector'),
    };
    const version = runCliRaw(['--version'], { cwd: tempRoot, env });
    expect(version.status).toBe(0);
    expect(version.stderr).toBe('');
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\n$/);

    const menuState = runCliRaw(['--json', 'service', 'menu-state'], {
      cwd: tempRoot,
      env,
    });
    expect(menuState.status).toBe(0);
    expect(() => JSON.parse(menuState.stdout)).not.toThrow();
    expect(JSON.parse(menuState.stdout)).toMatchObject({
      configured: false,
      running: false,
      starting: false,
    });

    const vectorHome = path.join(tempRoot, '.vector');
    mkdirSync(vectorHome, { recursive: true });
    writeFileSync(
      path.join(vectorHome, 'bridge.json'),
      JSON.stringify({
        deviceId: 'device-1',
        deviceKey: 'device-key',
        deviceSecret: 'must-not-leak',
        userId: 'user-1',
        displayName: 'Test Mac',
        convexUrl: 'https://example.convex.cloud',
        registeredAt: new Date().toISOString(),
      }),
    );
    const configuredState = runCliRaw(['--json', 'service', 'menu-state'], {
      cwd: tempRoot,
      env,
    });
    expect(configuredState.status).toBe(0);
    expect(configuredState.stdout).not.toContain('must-not-leak');
    expect(JSON.parse(configuredState.stdout).config).toEqual({
      deviceId: 'device-1',
      displayName: 'Test Mac',
      userId: 'user-1',
    });
    expect(statSync(vectorHome).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(vectorHome, 'bridge.json')).mode & 0o777).toBe(
      0o600,
    );
  }, 30_000);

  it('requires an app URL when no flag, env var, or saved session is available', () => {
    const tempHome = mkdtempSync(path.join(tmpdir(), 'vcli-home-'));
    const tempCwd = mkdtempSync(path.join(tmpdir(), 'vcli-cwd-'));
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: tempHome };
    delete env.NEXT_PUBLIC_APP_URL;

    const result = runCliRaw(['auth', 'whoami'], {
      cwd: tempCwd,
      env,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

    expect(result.status).toBe(1);
    expect(output).toContain('app URL is required');
  }, 30_000);

  it('renders the root help with all top-level commands', () => {
    const output = runCli(['--help']);

    [
      'auth',
      'org',
      'role',
      'invite',
      'refdata [slug]',
      'icons [options] <query>',
      'search [options] <query>',
      'permission',
      'activity',
      'notification',
      'priority',
      'state',
      'status',
      'admin',
      'team',
      'project',
      'request',
      'work',
      'task',
      'issue',
      'document',
      'folder',
    ].forEach(command => {
      expect(output).toContain(command);
    });
  }, 30_000);

  it.each([
    ['priority', 'update', '--clear-icon'],
    ['state', 'update', '--clear-icon'],
    ['status', 'update', '--clear-icon'],
    ['team', 'update', '--clear-description'],
  ])(
    'documents the explicit clearing flag for %s %s',
    (group, command, flag) => {
      expect(runCli([group, command, '--help'])).toContain(flag);
    },
    30_000,
  );

  it.each([
    [
      'auth',
      ['signup [options]', 'login [options] [identifier]', 'logout', 'whoami'],
    ],
    [
      'org',
      [
        'list',
        'current',
        'use <slug>',
        'create [options]',
        'update [options] [slug]',
        'stats [slug]',
        'logo [options] [slug]',
        'members [slug]',
        'invites [slug]',
        'invite [options] [slug]',
        'member-role [options] <member>',
        'remove-member <member>',
        'revoke-invite <inviteId>',
      ],
    ],
    [
      'role',
      [
        'list [slug]',
        'get <role>',
        'create [options]',
        'update [options] <role>',
        'assign <role> <member>',
        'unassign <role> <member>',
      ],
    ],
    ['invite', ['list', 'accept <inviteId>', 'decline <inviteId>']],
    [
      'permission',
      ['check [options] <permission>', 'check-many [options] <permissions>'],
    ],
    [
      'activity',
      [
        'project [options] <projectKey>',
        'team [options] <teamKey>',
        'issue [options] <issueKey>',
        'document [options] <documentId>',
      ],
    ],
    [
      'notification',
      [
        'inbox',
        'unread-count',
        'mark-read <recipientId>',
        'mark-all-read',
        'archive <recipientId>',
        'preferences',
        'set-preference [options] <category>',
        'subscriptions',
        'remove-subscription <subscriptionId>',
      ],
    ],
    [
      'priority',
      [
        'list [slug]',
        'create [options]',
        'update [options] <priority>',
        'delete <priority>',
        'reset [slug]',
      ],
    ],
    [
      'state',
      [
        'list [slug]',
        'create [options]',
        'update [options] <state>',
        'delete <state>',
        'reset [slug]',
      ],
    ],
    [
      'status',
      [
        'list [slug]',
        'create [options]',
        'update [options] <status>',
        'delete <status>',
        'reset [slug]',
      ],
    ],
    [
      'admin',
      [
        'branding',
        'set-branding [options]',
        'signup-policy',
        'set-signup-policy [options]',
        'sync-disposable-domains',
      ],
    ],
    [
      'team',
      [
        'list [options] [slug]',
        'get <teamKey>',
        'create [options]',
        'update [options] <teamKey>',
        'delete <teamKey>',
        'members <teamKey>',
        'add-member [options] <teamKey> <member>',
        'remove-member <teamKey> <member>',
        'set-lead <teamKey> <member>',
      ],
    ],
    [
      'project',
      [
        'list [options] [slug]',
        'get <projectKey>',
        'create [options]',
        'update [options] <projectKey>',
        'delete <projectKey>',
        'members <projectKey>',
        'add-member [options] <projectKey> <member>',
        'remove-member <projectKey> <member>',
        'set-lead <projectKey> <member>',
      ],
    ],
    [
      'request',
      [
        'list [options] [slug]',
        'get <requestKey>',
        'create [options]',
        'route <requestKey> <members>',
        'claim <requestKey>',
        'link-work [options] <requestKey> <workKey>',
        'request-changes [options] <requestKey>',
        'complete [options] <requestKey>',
      ],
    ],
    [
      'work',
      [
        'list [options] [slug]',
        'get <workKey>',
        'create [options]',
        'start <workKey>',
        'status <workKey> <status>',
        'context [options] <workKey>',
        'watch [options] <workKey>',
        'ready-for-review <workKey>',
        'complete <workKey>',
        'handoff [options] <workKey> <member>',
        'respond-handoff [options] <handoffId>',
        'attention [options] <workKey>',
      ],
    ],
    [
      'task',
      [
        'list <workKey>',
        'create [options] <workKey>',
        'status <workKey> <taskNumber> <status>',
        'assign <workKey> <taskNumber> [member]',
      ],
    ],
    [
      'issue',
      [
        'list [options] [slug]',
        'get <issueKey>',
        'create [options]',
        'update [options] <issueKey>',
        'delete <issueKey>',
        'assign [options] <issueKey> <member>',
        'unassign <issueKey> <member>',
        'assignments <issueKey>',
        'set-assignment-state <assignmentId> <state>',
        'reassign-assignment <assignmentId> <member>',
        'remove-assignment <assignmentId>',
        'set-priority <issueKey> <priority>',
        'replace-assignees <issueKey> <members>',
        'set-estimates [options] <issueKey>',
        'comment [options] <issueKey>',
        'link-github <issueKey> <url>',
      ],
    ],
    [
      'document',
      [
        'list [options] [slug]',
        'get <documentId>',
        'create [options]',
        'update [options] <documentId>',
        'move [options] <documentId>',
        'delete <documentId>',
      ],
    ],
    [
      'folder',
      [
        'list [options] [slug]',
        'create [options]',
        'update [options] <folderId>',
        'delete <folderId>',
      ],
    ],
  ])(
    'renders %s help with every registered subcommand',
    (command, subcommands) => {
      const output = runCli([command, '--help']);

      subcommands.forEach(subcommand => {
        expect(output).toContain(subcommand);
      });
    },
    30_000,
  );
});
