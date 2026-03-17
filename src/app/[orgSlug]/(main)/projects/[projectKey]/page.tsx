import type { Metadata } from 'next';
import { getConvexClient } from '@/lib/convex-server';
import { fetchAuthQuery } from '@/lib/auth-server';
import { api } from '@/convex/_generated/api';
import ProjectViewClient from './project-view-client';
import type { FunctionReturnType } from 'convex/server';

interface ProjectViewPageProps {
  params: Promise<{ orgSlug: string; projectKey: string }>;
  searchParams?: Promise<{ issueView?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: ProjectViewPageProps): Promise<Metadata> {
  const { orgSlug, projectKey } = await params;

  try {
    const client = getConvexClient();
    const data = await client.query(api.og.queries.getPublicProject, {
      orgSlug,
      projectKey,
    });

    if (!data) {
      return { title: `${projectKey} — Vector` };
    }

    const description =
      data.description ??
      `Project ${data.name} · ${data.issueCount} issue${data.issueCount !== 1 ? 's' : ''}`;

    return {
      title: `${data.name} — ${data.orgName}`,
      description,
      openGraph: {
        title: data.name,
        description,
        siteName: 'Vector',
      },
      twitter: {
        card: 'summary_large_image',
        title: data.name,
        description,
      },
    };
  } catch {
    return { title: `${projectKey} — Vector` };
  }
}

export default async function ProjectViewPage({
  params,
  searchParams,
}: ProjectViewPageProps) {
  const p = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : { issueView: undefined };
  const issueViewParam = Array.isArray(resolvedSearchParams.issueView)
    ? resolvedSearchParams.issueView[0]
    : resolvedSearchParams.issueView;
  const isTableView = issueViewParam === 'table';
  let initialProject: FunctionReturnType<
    typeof api.projects.queries.getByKey
  > | null = null;
  let initialWorkspaceOptions: FunctionReturnType<
    typeof api.organizations.queries.getWorkspaceOptions
  > | null = null;
  let initialIssuesData: FunctionReturnType<
    typeof api.issues.queries.listIssues
  > = {
    issues: [],
    total: 0,
    counts: {},
  };

  try {
    [initialProject, initialWorkspaceOptions] = await Promise.all([
      fetchAuthQuery(api.projects.queries.getByKey, {
        orgSlug: p.orgSlug,
        projectKey: p.projectKey,
      }),
      fetchAuthQuery(api.organizations.queries.getWorkspaceOptions, {
        orgSlug: p.orgSlug,
      }),
    ]);

    if (initialProject?._id) {
      initialIssuesData = await fetchAuthQuery(api.issues.queries.listIssues, {
        orgSlug: p.orgSlug,
        projectId: initialProject._id,
        page: isTableView ? 1 : undefined,
        pageSize: isTableView ? 25 : undefined,
      });
    }
  } catch {
    initialProject = null;
    initialWorkspaceOptions = null;
    initialIssuesData = {
      issues: [],
      total: 0,
      counts: {},
    };
  }

  return (
    <ProjectViewClient
      params={{ orgSlug: p.orgSlug, projectKey: p.projectKey }}
      initialProject={initialProject}
      initialWorkspaceOptions={initialWorkspaceOptions}
      initialIssuesData={initialIssuesData}
    />
  );
}
