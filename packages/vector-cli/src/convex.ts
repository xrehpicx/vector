import { ConvexHttpClient } from 'convex/browser';
import {
  FunctionReference,
  getFunctionName,
  OptionalRestArgs,
} from 'convex/server';
import { fetchConvexToken } from './auth';
import { annotateNetworkError, vectorFetch } from './network';
import { CliSession } from './session';

function safeFunctionName(
  ref: FunctionReference<'query' | 'mutation' | 'action'>,
): string {
  try {
    return getFunctionName(ref);
  } catch {
    return '<unknown function>';
  }
}

export function createUnauthenticatedConvexClient(convexUrl: string) {
  return new ConvexHttpClient(convexUrl, { fetch: vectorFetch });
}

export async function createConvexClient(
  session: CliSession,
  appUrl: string,
  convexUrl: string,
) {
  const { token } = await fetchConvexToken(session, appUrl);
  const client = createUnauthenticatedConvexClient(convexUrl);
  client.setAuth(token);
  return client;
}

export async function runQuery<Query extends FunctionReference<'query'>>(
  client: ConvexHttpClient,
  ref: Query,
  ...args: OptionalRestArgs<Query>
) {
  try {
    return await client.query(ref, ...args);
  } catch (error) {
    throw annotateNetworkError(error, `Convex query ${safeFunctionName(ref)}`);
  }
}

export async function runMutation<
  Mutation extends FunctionReference<'mutation'>,
>(
  client: ConvexHttpClient,
  ref: Mutation,
  ...args: OptionalRestArgs<Mutation>
) {
  try {
    return await client.mutation(ref, ...args);
  } catch (error) {
    throw annotateNetworkError(
      error,
      `Convex mutation ${safeFunctionName(ref)}`,
    );
  }
}

export async function runAction<Action extends FunctionReference<'action'>>(
  client: ConvexHttpClient,
  ref: Action,
  ...args: OptionalRestArgs<Action>
) {
  try {
    return await client.action(ref, ...args);
  } catch (error) {
    throw annotateNetworkError(error, `Convex action ${safeFunctionName(ref)}`);
  }
}
