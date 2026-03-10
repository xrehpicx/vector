'use client';

type SearchParamReader = {
  get(name: string): string | null;
};

export type AssistantPageContext =
  | {
      kind: 'documents_list';
      orgSlug: string;
      path: string;
      entityType?: 'document';
    }
  | {
      kind: 'document_detail';
      orgSlug: string;
      path: string;
      documentId: string;
      entityType: 'document';
      entityId: string;
    }
  | {
      kind: 'document_folder';
      orgSlug: string;
      path: string;
      folderId: string;
      entityType?: 'document';
    }
  | {
      kind: 'issues_list';
      orgSlug: string;
      path: string;
      assigneeFilter?: string;
      entityType?: 'issue';
    }
  | {
      kind: 'issue_detail';
      orgSlug: string;
      path: string;
      issueKey: string;
      entityType: 'issue';
      entityKey: string;
    }
  | {
      kind: 'projects_list';
      orgSlug: string;
      path: string;
      entityType?: 'project';
    }
  | {
      kind: 'project_detail';
      orgSlug: string;
      path: string;
      projectKey: string;
      entityType: 'project';
      entityKey: string;
    }
  | {
      kind: 'teams_list';
      orgSlug: string;
      path: string;
      entityType?: 'team';
    }
  | {
      kind: 'team_detail';
      orgSlug: string;
      path: string;
      teamKey: string;
      entityType: 'team';
      entityKey: string;
    }
  | {
      kind: 'org_generic';
      orgSlug: string;
      path: string;
    };

export function resolveAssistantPageContext(args: {
  orgSlug: string;
  pathname: string;
  searchParams?: SearchParamReader | null;
}): AssistantPageContext {
  const { orgSlug, pathname, searchParams } = args;
  const segments = pathname.split('/').filter(Boolean);
  const afterOrg = segments[1] ?? '';

  if (afterOrg === 'documents') {
    if (segments[2] === 'folders' && segments[3]) {
      return {
        kind: 'document_folder',
        orgSlug,
        path: pathname,
        folderId: segments[3],
      };
    }

    if (segments[2]) {
      return {
        kind: 'document_detail',
        orgSlug,
        path: pathname,
        documentId: segments[2],
        entityType: 'document',
        entityId: segments[2],
      };
    }

    return {
      kind: 'documents_list',
      orgSlug,
      path: pathname,
      entityType: 'document',
    };
  }

  if (afterOrg === 'issues') {
    if (segments[2]) {
      return {
        kind: 'issue_detail',
        orgSlug,
        path: pathname,
        issueKey: segments[2],
        entityType: 'issue',
        entityKey: segments[2],
      };
    }

    return {
      kind: 'issues_list',
      orgSlug,
      path: pathname,
      assigneeFilter: searchParams?.get('assignee') ?? undefined,
      entityType: 'issue',
    };
  }

  if (afterOrg === 'projects') {
    if (segments[2]) {
      return {
        kind: 'project_detail',
        orgSlug,
        path: pathname,
        projectKey: segments[2],
        entityType: 'project',
        entityKey: segments[2],
      };
    }

    return {
      kind: 'projects_list',
      orgSlug,
      path: pathname,
      entityType: 'project',
    };
  }

  if (afterOrg === 'teams') {
    if (segments[2]) {
      return {
        kind: 'team_detail',
        orgSlug,
        path: pathname,
        teamKey: segments[2],
        entityType: 'team',
        entityKey: segments[2],
      };
    }

    return {
      kind: 'teams_list',
      orgSlug,
      path: pathname,
      entityType: 'team',
    };
  }

  return {
    kind: 'org_generic',
    orgSlug,
    path: pathname,
  };
}

export function describeAssistantPageContext(
  pageContext: AssistantPageContext,
) {
  switch (pageContext.kind) {
    case 'document_detail':
      return `Document ${pageContext.documentId}`;
    case 'document_folder':
      return 'Document folder';
    case 'documents_list':
      return 'Documents';
    case 'issue_detail':
      return `Issue ${pageContext.issueKey}`;
    case 'issues_list':
      return 'Issues';
    case 'project_detail':
      return `Project ${pageContext.projectKey}`;
    case 'projects_list':
      return 'Projects';
    case 'team_detail':
      return `Team ${pageContext.teamKey}`;
    case 'teams_list':
      return 'Teams';
    default:
      return 'Workspace';
  }
}
