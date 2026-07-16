import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

export type CliSession = {
  version: 1;
  appUrl?: string;
  convexUrl?: string;
  activeOrgSlug?: string;
  cookies: Record<string, string>;
  bearerToken?: string;
};

type CliProfileConfig = {
  version: 1;
  defaultProfile: string;
};

function getSessionRoot() {
  const configured = process.env.VECTOR_HOME?.trim();
  if (configured && !path.isAbsolute(configured)) {
    throw new Error('VECTOR_HOME must be an absolute path.');
  }
  return configured || path.join(homedir(), '.vector');
}

function getProfileConfigPath() {
  return path.join(getSessionRoot(), 'cli-config.json');
}

export function getSessionPath(profile = 'default') {
  return path.join(
    getSessionRoot(),
    `cli-${normalizeProfileName(profile)}.json`,
  );
}

function normalizeProfileName(profile: string): string {
  const normalized = profile.trim() || 'default';
  if (
    normalized.length > 64 ||
    normalized.includes('..') ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)
  ) {
    throw new Error(
      'Profile name may contain only letters, numbers, dots, dashes, and underscores.',
    );
  }
  return normalized;
}

async function ensureSessionRoot() {
  const root = getSessionRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700).catch(() => {});
  return root;
}

async function writePrivateJson(filePath: string, value: unknown) {
  await ensureSessionRoot();
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
  await chmod(filePath, 0o600).catch(() => {});
}

export async function readDefaultProfile() {
  try {
    const raw = await readFile(getProfileConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliProfileConfig>;
    return normalizeProfileName(parsed.defaultProfile ?? 'default');
  } catch {
    return 'default';
  }
}

export async function writeDefaultProfile(profile: string) {
  const normalized = normalizeProfileName(profile);
  const config: CliProfileConfig = {
    version: 1,
    defaultProfile: normalized,
  };
  await writePrivateJson(getProfileConfigPath(), config);
}

export async function listProfiles() {
  const root = getSessionRoot();
  const defaultProfile = await readDefaultProfile();

  try {
    const entries = await readdir(root, { withFileTypes: true });
    const names = entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => name !== 'cli-config.json' && /^cli-.+\.json$/.test(name))
      .map(name => name.replace(/^cli-/, '').replace(/\.json$/, ''));
    const uniqueNames = Array.from(new Set([...names, defaultProfile])).sort(
      (left, right) => left.localeCompare(right),
    );

    return Promise.all(
      uniqueNames.map(async name => ({
        name,
        isDefault: name === defaultProfile,
        hasSession: (await readSession(name)) !== null,
      })),
    );
  } catch {
    return [
      {
        name: defaultProfile,
        isDefault: true,
        hasSession: (await readSession(defaultProfile)) !== null,
      },
    ];
  }
}

export async function readSession(profile = 'default') {
  try {
    const sessionPath = getSessionPath(profile);
    const raw = await readFile(sessionPath, 'utf8');
    await chmod(sessionPath, 0o600).catch(() => {});
    const parsed = JSON.parse(raw) as Partial<CliSession>;
    return {
      version: 1,
      cookies: {},
      ...parsed,
    } satisfies CliSession;
  } catch {
    return null;
  }
}

export async function writeSession(session: CliSession, profile = 'default') {
  await writePrivateJson(getSessionPath(profile), session);
}

export async function clearSession(profile = 'default') {
  await rm(getSessionPath(profile), { force: true });
}

export function createEmptySession(): CliSession {
  return {
    version: 1,
    cookies: {},
  };
}
