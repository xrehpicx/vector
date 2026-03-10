/**
 * Utilities for extracting and syncing document mentions.
 *
 * Mentions are stored as links in document HTML content with specific href patterns:
 * - Users:    /{orgSlug}/people/{userId}
 * - Teams:    /{orgSlug}/teams/{TEAM_KEY}
 * - Projects: /{orgSlug}/projects/{PROJECT_KEY}
 * - Issues:   /{orgSlug}/issues/{ISSUE_KEY}
 */

import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export type MentionRef = {
  mentionType: 'user' | 'team' | 'project' | 'issue';
  /** For users this is the Convex user ID; for others it's the key (e.g. "TEAM", "PROJ-1") */
  rawRef: string;
};

// Regex to extract href values from anchor tags
const HREF_RE = /href="([^"]+)"/g;

// Patterns to classify and extract entity references from hrefs
const MENTION_PATTERNS: {
  type: MentionRef['mentionType'];
  pattern: RegExp;
}[] = [
  // /orgSlug/people/{userId} — userId is a Convex ID like "k17..."
  { type: 'user', pattern: /\/[^/]+\/people\/([^#/?]+)/ },
  // /orgSlug/teams/{TEAM_KEY}
  { type: 'team', pattern: /\/[^/]+\/teams\/([A-Z][A-Z0-9_-]*)(?:#|$)/ },
  // /orgSlug/projects/{PROJECT_KEY}
  {
    type: 'project',
    pattern: /\/[^/]+\/projects\/([A-Z][A-Z0-9_-]*)(?:#|$)/,
  },
  // /orgSlug/issues/{ISSUE_KEY} e.g. PROJ-42
  { type: 'issue', pattern: /\/[^/]+\/issues\/([A-Z]+-\d+)/ },
];

/** Extract unique mention references from document HTML content. */
export function extractMentions(html: string): MentionRef[] {
  const seen = new Set<string>();
  const refs: MentionRef[] = [];

  let match: RegExpExecArray | null;
  while ((match = HREF_RE.exec(html)) !== null) {
    const href = match[1];
    for (const { type, pattern } of MENTION_PATTERNS) {
      const m = href.match(pattern);
      if (m) {
        const key = `${type}:${m[1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({ mentionType: type, rawRef: m[1] });
        }
        break; // first match wins
      }
    }
  }

  return refs;
}

/**
 * Resolve raw mention refs (keys) to Convex entity IDs.
 * Users already have IDs; teams/projects/issues need key→ID lookup.
 */
export async function resolveMentionIds(
  ctx: MutationCtx,
  orgId: Id<'organizations'>,
  refs: MentionRef[],
): Promise<{ mentionType: MentionRef['mentionType']; entityId: string }[]> {
  const resolved: {
    mentionType: MentionRef['mentionType'];
    entityId: string;
  }[] = [];

  for (const ref of refs) {
    switch (ref.mentionType) {
      case 'user': {
        // rawRef is already the user ID — verify it exists
        try {
          const user = await ctx.db.get('users', ref.rawRef as Id<'users'>);
          if (user) {
            resolved.push({ mentionType: 'user', entityId: ref.rawRef });
          }
        } catch {
          // Invalid ID format — skip
        }
        break;
      }
      case 'team': {
        const team = await ctx.db
          .query('teams')
          .withIndex('by_org_key', q =>
            q.eq('organizationId', orgId).eq('key', ref.rawRef),
          )
          .first();
        if (team) {
          resolved.push({ mentionType: 'team', entityId: team._id });
        }
        break;
      }
      case 'project': {
        const project = await ctx.db
          .query('projects')
          .withIndex('by_org_key', q =>
            q.eq('organizationId', orgId).eq('key', ref.rawRef),
          )
          .first();
        if (project) {
          resolved.push({ mentionType: 'project', entityId: project._id });
        }
        break;
      }
      case 'issue': {
        // Issue key format: PROJ-42 → stored as searchText or key field
        const issue = await ctx.db
          .query('issues')
          .withIndex('by_org_key', q =>
            q.eq('organizationId', orgId).eq('key', ref.rawRef),
          )
          .first();
        if (issue) {
          resolved.push({ mentionType: 'issue', entityId: issue._id });
        }
        break;
      }
    }
  }

  return resolved;
}

/**
 * Sync the documentMentions table for a given document.
 * Diffs existing mentions against new ones and inserts/deletes accordingly.
 */
export async function syncDocumentMentions(
  ctx: MutationCtx,
  documentId: Id<'documents'>,
  organizationId: Id<'organizations'>,
  content: string | undefined,
) {
  // Get current mentions from DB
  const existing = await ctx.db
    .query('documentMentions')
    .withIndex('by_document', q => q.eq('documentId', documentId))
    .collect();

  const existingSet = new Set(
    existing.map(m => `${m.mentionType}:${m.entityId}`),
  );

  // Parse new mentions from content
  let newMentions: {
    mentionType: MentionRef['mentionType'];
    entityId: string;
  }[] = [];
  if (content) {
    const refs = extractMentions(content);
    newMentions = await resolveMentionIds(ctx, organizationId, refs);
  }

  const newSet = new Set(
    newMentions.map(m => `${m.mentionType}:${m.entityId}`),
  );

  // Delete removed mentions
  for (const mention of existing) {
    const key = `${mention.mentionType}:${mention.entityId}`;
    if (!newSet.has(key)) {
      await ctx.db.delete('documentMentions', mention._id);
    }
  }

  // Insert new mentions
  for (const mention of newMentions) {
    const key = `${mention.mentionType}:${mention.entityId}`;
    if (!existingSet.has(key)) {
      await ctx.db.insert('documentMentions', {
        documentId,
        organizationId,
        mentionType: mention.mentionType,
        entityId: mention.entityId,
      });
    }
  }
}
