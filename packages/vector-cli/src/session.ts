import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  return process.env.VECTOR_HOME?.trim() || path.join(homedir(), '.vector');
}

function getProfileConfigPath() {
  return path.join(getSessionRoot(), 'cli-config.json');
}

export function getSessionPath(profile = 'default') {
  return path.join(getSessionRoot(), `cli-${profile}.json`);
}

export async function readDefaultProfile() {
  try {
    const raw = await readFile(getProfileConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliProfileConfig>;
    const profile = parsed.defaultProfile?.trim();
    return profile || 'default';
  } catch {
    return 'default';
  }
}

export async function writeDefaultProfile(profile: string) {
  const normalized = profile.trim() || 'default';
  await mkdir(getSessionRoot(), { recursive: true });
  const config: CliProfileConfig = {
    version: 1,
    defaultProfile: normalized,
  };
  await writeFile(
    getProfileConfigPath(),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

export async function listProfiles() {
  const root = getSessionRoot();
  const defaultProfile = await readDefaultProfile();

  try {
    const entries = await readdir(root, { withFileTypes: true });
    const names = entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => /^cli-.+\.json$/.test(name))
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
    const raw = await readFile(getSessionPath(profile), 'utf8');
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
  await mkdir(getSessionRoot(), { recursive: true });
  await writeFile(
    getSessionPath(profile),
    `${JSON.stringify(session, null, 2)}\n`,
    'utf8',
  );
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
