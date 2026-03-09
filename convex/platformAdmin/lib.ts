import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { DatabaseReader, DatabaseWriter } from '../_generated/server';

export const PLATFORM_ADMIN_ROLE = 'platform_admin';
export const MAX_MANUAL_SIGNUP_DOMAIN_RULES = 500;
export const MAX_DOMAIN_RULE_BATCH_SIZE = 500;

const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export type DomainListNormalizationResult = {
  domains: string[];
  invalid: string[];
};

export type SignupRestrictionResult = {
  blocked: boolean;
  domain: string | null;
  reason: 'not_allowed' | 'blocked' | null;
};

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '');
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(normalizeDomain(domain));
}

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex >= trimmed.length - 1) {
    return null;
  }

  const domain = normalizeDomain(trimmed.slice(atIndex + 1));
  return isValidDomain(domain) ? domain : null;
}

export function normalizeDomainList(
  inputDomains: string[],
): DomainListNormalizationResult {
  const domains = new Set<string>();
  const invalid = new Set<string>();

  for (const raw of inputDomains) {
    const normalized = normalizeDomain(raw);
    if (!normalized) {
      continue;
    }

    if (!isValidDomain(normalized)) {
      invalid.add(raw.trim());
      continue;
    }

    domains.add(normalized);
  }

  return {
    domains: Array.from(domains),
    invalid: Array.from(invalid),
  };
}

export function domainMatchesRule(domain: string, rule: string): boolean {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedRule = normalizeDomain(rule);

  if (!normalizedDomain || !normalizedRule) {
    return false;
  }

  return (
    normalizedDomain === normalizedRule ||
    normalizedDomain.endsWith(`.${normalizedRule}`)
  );
}

export function domainMatchesAnyRule(domain: string, rules: string[]): boolean {
  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) {
    return false;
  }

  const normalizedRules = normalizeDomainList(rules).domains;
  return normalizedRules.some(rule =>
    domainMatchesRule(normalizedDomain, rule),
  );
}

export function getDomainMatchCandidates(domain: string): string[] {
  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) {
    return [];
  }

  const labels = normalizedDomain.split('.');
  const candidates: string[] = [];

  for (let index = 0; index < labels.length; index += 1) {
    const candidate = labels.slice(index).join('.');
    if (candidate.length > 0) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

export async function ensureSiteSettings(
  db: DatabaseWriter,
): Promise<Id<'siteSettings'>> {
  const existing = await db.query('siteSettings').first();

  if (existing) {
    return existing._id;
  }

  return await db.insert('siteSettings', {});
}

export async function getSiteSettings(db: DatabaseReader) {
  return await db.query('siteSettings').first();
}

export async function hasPlatformAdminUsers(
  db: DatabaseReader,
): Promise<boolean> {
  const admin = await db
    .query('users')
    .withIndex('by_role', q => q.eq('role', PLATFORM_ADMIN_ROLE))
    .first();

  return admin !== null;
}

export async function isPlatformAdminUser(
  db: DatabaseReader,
  userId: Id<'users'>,
): Promise<boolean> {
  const user = await db.get('users', userId);
  return user?.role === PLATFORM_ADMIN_ROLE;
}

export async function requirePlatformAdminUser(
  db: DatabaseReader,
  userId: Id<'users'>,
): Promise<void> {
  if (!(await isPlatformAdminUser(db, userId))) {
    throw new ConvexError('FORBIDDEN');
  }
}

export async function evaluateSignupEmailAddress(
  db: DatabaseReader,
  email: string,
): Promise<SignupRestrictionResult> {
  const emailDomain = extractEmailDomain(email);
  if (!emailDomain) {
    return {
      blocked: false,
      domain: null,
      reason: null,
    };
  }

  const settings = await getSiteSettings(db);
  const allowedDomains = settings?.signupAllowedEmailDomains ?? [];
  const blockedDomains = settings?.signupBlockedEmailDomains ?? [];

  if (allowedDomains.length > 0) {
    if (domainMatchesAnyRule(emailDomain, allowedDomains)) {
      return {
        blocked: false,
        domain: emailDomain,
        reason: null,
      };
    }

    return {
      blocked: true,
      domain: emailDomain,
      reason: 'not_allowed',
    };
  }

  if (domainMatchesAnyRule(emailDomain, blockedDomains)) {
    return {
      blocked: true,
      domain: emailDomain,
      reason: 'blocked',
    };
  }

  const candidates = getDomainMatchCandidates(emailDomain);
  for (const candidate of candidates) {
    const upstreamRule = await db
      .query('signupEmailDomainRules')
      .withIndex('by_type_domain', q =>
        q.eq('type', 'blocked').eq('domain', candidate),
      )
      .first();

    if (upstreamRule?.source === 'upstream_disposable') {
      return {
        blocked: true,
        domain: emailDomain,
        reason: 'blocked',
      };
    }
  }

  return {
    blocked: false,
    domain: emailDomain,
    reason: null,
  };
}
