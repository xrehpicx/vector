'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '@/lib/convex';
import { useScopedPermissions } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { toast } from 'sonner';
import { CreateIssueDialogContent } from '@/components/issues/create-issue-dialog';
import { CreateProjectDialogContent } from '@/components/projects/create-project-dialog';
import { CreateTeamDialogContent } from '@/components/teams/create-team-dialog';

/**
 * Headless component that listens for command-menu custom events
 * and opens the corresponding create dialogs.
 */
export function CommandMenuActions() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const router = useRouter();
  const createDocument = useMutation(api.documents.mutations.create);
  const { permissions } = useScopedPermissions({ orgSlug }, [
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.TEAM_CREATE,
    PERMISSIONS.DOCUMENT_CREATE,
  ]);

  const [issueOpen, setIssueOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  useEffect(() => {
    const onCreateIssue = () => {
      if (!permissions[PERMISSIONS.ISSUE_CREATE]) return;
      setIssueOpen(true);
    };
    const onCreateProject = () => {
      if (!permissions[PERMISSIONS.PROJECT_CREATE]) return;
      setProjectOpen(true);
    };
    const onCreateTeam = () => {
      if (!permissions[PERMISSIONS.TEAM_CREATE]) return;
      setTeamOpen(true);
    };
    const onCreateDocument = async () => {
      if (!permissions[PERMISSIONS.DOCUMENT_CREATE]) return;

      try {
        const result = await createDocument({
          orgSlug,
          data: {
            title: 'Untitled',
            visibility: 'organization',
          },
        });
        router.push(`/${orgSlug}/documents/${result.documentId}`);
      } catch {
        toast.error('Failed to create document');
      }
    };

    window.addEventListener('command-menu:create-issue', onCreateIssue);
    window.addEventListener('command-menu:create-project', onCreateProject);
    window.addEventListener('command-menu:create-team', onCreateTeam);
    window.addEventListener('command-menu:create-document', onCreateDocument);

    return () => {
      window.removeEventListener('command-menu:create-issue', onCreateIssue);
      window.removeEventListener(
        'command-menu:create-project',
        onCreateProject,
      );
      window.removeEventListener('command-menu:create-team', onCreateTeam);
      window.removeEventListener(
        'command-menu:create-document',
        onCreateDocument,
      );
    };
  }, [createDocument, orgSlug, permissions, router]);

  return (
    <>
      {issueOpen && (
        <CreateIssueDialogContent
          orgSlug={orgSlug}
          onClose={() => setIssueOpen(false)}
        />
      )}
      {projectOpen && (
        <CreateProjectDialogContent
          orgSlug={orgSlug}
          onClose={() => setProjectOpen(false)}
        />
      )}
      {teamOpen && (
        <CreateTeamDialogContent
          orgSlug={orgSlug}
          onClose={() => setTeamOpen(false)}
        />
      )}
    </>
  );
}
