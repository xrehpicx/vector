import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

async function issueKeyExists(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  key: string,
) {
  const existingIssue = await ctx.db
    .query('issues')
    .withIndex('by_org_key', q =>
      q.eq('organizationId', organizationId).eq('key', key),
    )
    .first();

  return existingIssue !== null;
}

export async function getNextAvailableIssueKey(
  ctx: QueryCtx | MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    prefix: string;
    startingSequenceNumber: number;
  },
) {
  let sequenceNumber = Math.max(1, args.startingSequenceNumber);

  while (true) {
    const key = `${args.prefix}-${sequenceNumber}`;
    if (!(await issueKeyExists(ctx, args.organizationId, key))) {
      return { key, sequenceNumber };
    }
    sequenceNumber += 1;
  }
}

export function parseIssueKeyParts(key: string) {
  const match = key.match(/^(.*)-(\d+)$/);
  if (!match) {
    return {
      prefix: key,
      sequenceNumber: 2,
    };
  }

  return {
    prefix: match[1],
    sequenceNumber: Number(match[2]) + 1,
  };
}
