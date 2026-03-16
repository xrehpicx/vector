import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const cliEntrypoint = path.join(repoRoot, 'src/cli/index.ts');
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
        `CLI command failed: vecli ${args.join(' ')}`,
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
  it('requires an app URL when no flag, env var, or saved session is available', () => {
    const tempHome = mkdtempSync(path.join(tmpdir(), 'vecli-home-'));
    const tempCwd = mkdtempSync(path.join(tmpdir(), 'vecli-cwd-'));
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: tempHome };
    delete env.NEXT_PUBLIC_APP_URL;

    const result = runCliRaw(['auth', 'whoami'], {
      cwd: tempCwd,
      env,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

    expect(result.status).toBe(1);
    expect(output).toContain('app URL is required');
  });

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
      'issue',
      'document',
      'folder',
    ].forEach(command => {
      expect(output).toContain(command);
    });
  }, 30_000);

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
        'list [slug]',
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
