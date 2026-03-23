'use client';

import type { ToolUIPart } from 'ai';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Trash2,
  Wrench,
  FileText,
  CircleDot,
  FolderKanban,
  Users,
  X,
} from 'lucide-react';
import { BarsSpinner } from '@/components/bars-spinner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Fragment, useState, type ComponentType, type ReactNode } from 'react';
import { useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AssistantIssueCard } from './assistant-issue-card';
import {
  AssistantProjectCard,
  AssistantTeamCard,
  AssistantDocumentCard,
} from './assistant-entity-cards';

export interface AssistantToolComponentProps {
  tool: ToolUIPart;
}

export interface AssistantToolConfig {
  callComponent?: ComponentType<AssistantToolComponentProps>;
  resultComponent?: ComponentType<AssistantToolComponentProps>;
  displayName?: string;
}

type AssistantToolConfigs = Record<string, AssistantToolConfig>;

function normalizeToolType(toolType: string) {
  return toolType.startsWith('tool-') ? toolType : `tool-${toolType}`;
}

function toTitleCase(value: string) {
  return value
    .replace(/^tool-/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

function getToolOutput(tool: ToolUIPart) {
  return tool.output ?? null;
}

function getToolSummary(tool: ToolUIPart) {
  const output = getToolOutput(tool);
  if (!output || typeof output !== 'object') return null;

  const candidate = output as Record<string, unknown>;
  const label =
    (typeof candidate.summary === 'string' && candidate.summary) ||
    (typeof candidate.message === 'string' && candidate.message) ||
    (typeof candidate.entityLabel === 'string' && candidate.entityLabel) ||
    (typeof candidate.title === 'string' && candidate.title) ||
    (typeof candidate.name === 'string' && candidate.name) ||
    (typeof candidate.key === 'string' && candidate.key);

  return label || null;
}

function getEntityList(tool: ToolUIPart) {
  const output = getToolOutput(tool);
  if (!output || typeof output !== 'object') return [];

  const candidate = output as Record<string, unknown>;
  const listKey = ['documents', 'issues', 'projects', 'teams', 'items'].find(
    key => Array.isArray(candidate[key]),
  );

  if (!listKey) return [];

  return (candidate[listKey] as Array<Record<string, unknown>>)
    .slice(0, 4)
    .map(item => {
      const label =
        (typeof item.title === 'string' && item.title) ||
        (typeof item.name === 'string' && item.name) ||
        (typeof item.key === 'string' && item.key) ||
        (typeof item.slug === 'string' && item.slug);

      return label || 'Item';
    });
}

function getDisplayName(tool: ToolUIPart) {
  const explicit =
    toolConfigs[normalizeToolType(tool.type)]?.displayName ??
    toolConfigs[tool.type]?.displayName;
  return explicit || toTitleCase(tool.type);
}

function DenseToolShell({
  icon,
  title,
  status,
  tone = 'muted',
  children,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  tone?: 'muted' | 'success' | 'destructive';
  children?: ReactNode;
}) {
  return (
    <div className='max-w-full min-w-0 py-0.5'>
      <div className='flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]'>
        <div className='text-muted-foreground/50 shrink-0'>{icon}</div>
        <span className='text-muted-foreground/70 min-w-0 flex-1 break-words'>
          {title}
        </span>
        <span
          className={cn('text-[10px]', {
            'text-muted-foreground/40 shrink-0': tone === 'muted',
            'shrink-0 text-emerald-600/60': tone === 'success',
            'shrink-0 text-[#cb706f]/60': tone === 'destructive',
          })}
        >
          {status}
        </span>
      </div>
      {children ? (
        <div className='mt-1 min-w-0 overflow-hidden'>{children}</div>
      ) : null}
    </div>
  );
}

export function DefaultAssistantToolCall({
  tool,
}: AssistantToolComponentProps) {
  return (
    <DenseToolShell
      icon={<BarsSpinner size={10} />}
      title={getDisplayName(tool)}
      status='running'
    />
  );
}

export function DefaultAssistantToolResult({
  tool,
}: AssistantToolComponentProps) {
  const output = getToolOutput(tool);
  const isError =
    output &&
    typeof output === 'object' &&
    'type' in output &&
    (output as { type?: unknown }).type === 'error-text';
  const status = tool.state === 'output-error' || isError ? 'failed' : 'done';

  const summary = getToolSummary(tool);
  const listItems = getEntityList(tool);

  return (
    <DenseToolShell
      icon={
        status === 'failed' ? (
          <AlertCircle className='size-3' />
        ) : (
          <CheckCircle2 className='size-3' />
        )
      }
      title={getDisplayName(tool)}
      status={status}
      tone={status === 'failed' ? 'destructive' : 'success'}
    >
      {summary ? (
        <div className='text-muted-foreground/60 min-w-0 text-[11px] leading-4 break-words'>
          {summary}
        </div>
      ) : null}
      {listItems.length > 0 ? (
        <div className='flex min-w-0 flex-wrap gap-1'>
          {listItems.map(item => (
            <Badge
              key={item}
              variant='secondary'
              className='h-4 max-w-full overflow-hidden rounded px-1 text-[10px] font-normal text-ellipsis whitespace-nowrap'
            >
              {item}
            </Badge>
          ))}
        </div>
      ) : null}
    </DenseToolShell>
  );
}

function DeleteRequestToolResult({ tool }: AssistantToolComponentProps) {
  const output = getToolOutput(tool) as {
    summary?: string;
    id?: string;
    entityType?: string;
    entityLabel?: string;
    entities?: Array<{ entityId: string; entityLabel: string }>;
    kind?: string;
  } | null;
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const executeConfirmedAction = useMutation(
    api.ai.mutations.executeConfirmedAction,
  );
  const cancelPendingAction = useMutation(api.ai.mutations.cancelPendingAction);
  const [confirmAction, ConfirmDialog] = useConfirm();
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleConfirm = async () => {
    if (!output?.id || !orgSlug) return;

    const isBulk = output.kind === 'bulk_delete_entities';
    const description = isBulk
      ? `This will permanently delete ${output.entities?.length ?? 0} ${output.entityType ?? 'item'}(s) and cannot be undone.\n\n${(output.entities ?? []).map(e => `• ${e.entityLabel}`).join('\n')}`
      : `This will permanently delete "${output.entityLabel ?? 'this item'}" and cannot be undone.`;

    const ok = await confirmAction({
      title: isBulk
        ? `Delete ${output.entities?.length ?? 0} ${output.entityType ?? 'item'}s`
        : `Delete ${output.entityType ?? 'item'}`,
      description,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    setIsExecuting(true);
    try {
      await executeConfirmedAction({
        orgSlug,
        actionId: output.id,
      });
      setIsDone(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancel = async () => {
    if (!orgSlug) return;
    setIsCancelling(true);
    try {
      await cancelPendingAction({ orgSlug });
      setIsDone(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cancel failed');
    } finally {
      setIsCancelling(false);
    }
  };

  if (isDone) {
    return (
      <DenseToolShell
        icon={<CheckCircle2 className='size-3' />}
        title={getDisplayName(tool)}
        status='done'
        tone='success'
      >
        {output?.summary ? (
          <div className='text-muted-foreground/60 min-w-0 text-[11px] leading-4 break-words'>
            {output.summary}
          </div>
        ) : null}
      </DenseToolShell>
    );
  }

  return (
    <>
      <DenseToolShell
        icon={<Trash2 className='size-3' />}
        title={getDisplayName(tool)}
        status='awaiting confirmation'
        tone='destructive'
      >
        {output?.summary ? (
          <div className='text-muted-foreground/60 min-w-0 text-[11px] leading-4 break-words'>
            {output.summary}
          </div>
        ) : null}
        {output?.id ? (
          <div className='mt-1.5 flex items-center gap-1.5'>
            <Button
              size='sm'
              variant='destructive'
              className='h-6 px-2.5 text-[11px]'
              onClick={() => void handleConfirm()}
              disabled={isExecuting || isCancelling}
            >
              {isExecuting ? (
                <Loader2 className='mr-1 size-3 animate-spin' />
              ) : null}
              Confirm delete
            </Button>
            <Button
              size='sm'
              variant='ghost'
              className='text-muted-foreground h-6 px-2 text-[11px]'
              onClick={() => void handleCancel()}
              disabled={isExecuting || isCancelling}
            >
              {isCancelling ? (
                <Loader2 className='mr-1 size-3 animate-spin' />
              ) : null}
              Cancel
            </Button>
          </div>
        ) : null}
      </DenseToolShell>
      <ConfirmDialog />
    </>
  );
}

// --- Entity display renderers for show* tools ---

type DisplayEntity = Record<string, unknown>;

function entityIcon(display: string) {
  switch (display) {
    case 'issues':
      return <CircleDot className='size-3' />;
    case 'projects':
      return <FolderKanban className='size-3' />;
    case 'teams':
      return <Users className='size-3' />;
    case 'documents':
      return <FileText className='size-3' />;
    default:
      return null;
  }
}

function entityHref(display: string, orgSlug: string, item: DisplayEntity) {
  switch (display) {
    case 'issues':
      return `/${orgSlug}/issues/${item.key}`;
    case 'projects':
      return `/${orgSlug}/projects/${item.key}`;
    case 'teams':
      return `/${orgSlug}/teams/${item.key}`;
    case 'documents':
      return `/${orgSlug}/documents/${item.id}`;
    default:
      return null;
  }
}

function EntityRow({
  display,
  orgSlug,
  item,
}: {
  display: string;
  orgSlug: string;
  item: DisplayEntity;
}) {
  const title = (item.title ?? item.name ?? item.key ?? 'Untitled') as string;
  const key = (item.key ?? '') as string;
  const subtitle = (item.stateName ??
    item.statusName ??
    item.priorityName ??
    item.visibility ??
    '') as string;
  const assignee = (item.assigneeName ?? item.leadName ?? '') as string;
  const href = entityHref(display, orgSlug, item);

  const content = (
    <div className='hover:bg-muted/50 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors'>
      <span className='text-muted-foreground/50 mt-0.5 shrink-0'>
        {entityIcon(display)}
      </span>
      <div className='min-w-0'>
        <div className='min-w-0 truncate'>{title}</div>
        {(key || subtitle || assignee) && (
          <div className='text-muted-foreground/50 mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]'>
            {key ? (
              <span className='text-muted-foreground/60 shrink-0 font-mono text-[10px]'>
                {key}
              </span>
            ) : null}
            {subtitle ? (
              <span className='min-w-0 truncate'>{subtitle}</span>
            ) : null}
            {assignee ? (
              <span className='min-w-0 truncate'>{assignee}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className='block min-w-0'>
        {content}
      </Link>
    );
  }
  return content;
}

function EntityListResult({ tool }: AssistantToolComponentProps) {
  const output = getToolOutput(tool) as {
    _display?: string;
    orgSlug?: string;
    items?: DisplayEntity[];
  } | null;
  if (!output?.items || !output._display || !output.orgSlug) {
    return <DefaultAssistantToolResult tool={tool} />;
  }

  const { _display, orgSlug, items } = output;

  if (items.length === 0) {
    return (
      <div className='text-muted-foreground/50 py-1 text-[11px]'>
        No {_display} found.
      </div>
    );
  }

  return (
    <div className='bg-muted/20 max-w-full min-w-0 overflow-hidden rounded-lg border'>
      {items.map((item, i) => (
        <div
          key={(item.id ?? item.key ?? i) as string}
          className={cn(i > 0 && 'border-border/50 border-t')}
        >
          <EntityRow display={_display} orgSlug={orgSlug} item={item} />
        </div>
      ))}
    </div>
  );
}

function hasErrorOutput(tool: ToolUIPart) {
  const output = getToolOutput(tool);
  return (
    tool.state === 'output-error' ||
    (output &&
      typeof output === 'object' &&
      'type' in output &&
      (output as { type?: unknown }).type === 'error-text')
  );
}

function IssueToolResult({ tool }: AssistantToolComponentProps) {
  const output = getToolOutput(tool) as { key?: string } | null;
  if (hasErrorOutput(tool) || !output?.key) {
    return <DefaultAssistantToolResult tool={tool} />;
  }
  return <AssistantIssueCard issueKey={output.key} />;
}

function ProjectToolResult({ tool }: AssistantToolComponentProps) {
  const output = getToolOutput(tool) as { key?: string } | null;
  if (hasErrorOutput(tool) || !output?.key) {
    return <DefaultAssistantToolResult tool={tool} />;
  }
  return <AssistantProjectCard projectKey={output.key} />;
}

function TeamToolResult({ tool }: AssistantToolComponentProps) {
  const output = getToolOutput(tool) as { key?: string } | null;
  if (hasErrorOutput(tool) || !output?.key) {
    return <DefaultAssistantToolResult tool={tool} />;
  }
  return <AssistantTeamCard teamKey={output.key} />;
}

function DocumentToolResult({ tool }: AssistantToolComponentProps) {
  const output = getToolOutput(tool) as {
    documentId?: string;
    id?: string;
  } | null;
  const documentId = output?.documentId ?? output?.id;
  if (hasErrorOutput(tool) || !documentId) {
    return <DefaultAssistantToolResult tool={tool} />;
  }
  return <AssistantDocumentCard documentId={documentId} />;
}

function EmailPreviewResult({ tool }: AssistantToolComponentProps) {
  const output = getToolOutput(tool) as {
    _display?: string;
    recipient?: string;
    recipientEmail?: string;
    subject?: string;
    template?: string;
    html?: string;
  } | null;

  if (!output?.html) {
    return <DefaultAssistantToolResult tool={tool} />;
  }

  return (
    <div className='max-w-full min-w-0 py-0.5'>
      <DenseToolShell
        icon={<Mail className='size-3' />}
        title={`Email preview → ${output.recipient ?? 'recipient'}`}
        status={output.template ?? 'default'}
        tone='success'
      >
        <div className='text-muted-foreground/60 mb-1 text-[11px]'>
          Subject: {output.subject}
        </div>
      </DenseToolShell>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type='button'
            className='bg-muted/30 hover:bg-muted/50 mt-1 w-full cursor-pointer overflow-hidden rounded-md border text-left transition-colors'
          >
            <div className='pointer-events-none h-[120px] origin-top-left overflow-hidden'>
              <iframe
                srcDoc={output.html}
                title='Email preview'
                className='h-[600px] w-[560px] border-0'
                style={{
                  transform: 'scale(0.45)',
                  transformOrigin: 'top left',
                }}
                sandbox=''
              />
            </div>
            <div className='text-muted-foreground border-t px-2 py-1 text-center text-[10px]'>
              Click to expand preview
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className='max-h-[85vh] max-w-2xl overflow-y-auto p-0'>
          <DialogHeader className='border-b px-4 py-3'>
            <DialogTitle className='text-sm'>
              Email Preview — {output.subject}
            </DialogTitle>
          </DialogHeader>
          <div className='bg-[#0a0a0a]'>
            <iframe
              srcDoc={output.html}
              title='Email preview'
              className='h-[500px] w-full border-0'
              sandbox=''
            />
          </div>
          <div className='text-muted-foreground border-t px-4 py-2 text-xs'>
            To: {output.recipient} ({output.recipientEmail})
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const toolConfigs: AssistantToolConfigs = {
  'tool-listWorkspaceReferenceData': {
    displayName: 'List workspace context',
    resultComponent: DefaultAssistantToolResult,
  },
  'tool-listDocuments': {
    displayName: 'List documents',
    resultComponent: DefaultAssistantToolResult,
  },
  'tool-getDocument': {
    displayName: 'Inspect document',
    resultComponent: DocumentToolResult,
  },
  'tool-createDocument': {
    displayName: 'Create document',
    resultComponent: DocumentToolResult,
  },
  'tool-updateDocument': {
    displayName: 'Update document',
    resultComponent: DocumentToolResult,
  },
  'tool-requestDeleteDocument': {
    displayName: 'Delete document',
    resultComponent: DeleteRequestToolResult,
  },
  'tool-listIssues': {
    displayName: 'List issues',
    resultComponent: DefaultAssistantToolResult,
  },
  'tool-getIssue': {
    displayName: 'Inspect issue',
    resultComponent: IssueToolResult,
  },
  'tool-createIssue': {
    displayName: 'Create issue',
    resultComponent: IssueToolResult,
  },
  'tool-updateIssue': {
    displayName: 'Update issue',
    resultComponent: IssueToolResult,
  },
  'tool-requestDeleteIssue': {
    displayName: 'Delete issue',
    resultComponent: DeleteRequestToolResult,
  },
  'tool-listProjects': {
    displayName: 'List projects',
    resultComponent: DefaultAssistantToolResult,
  },
  'tool-getProject': {
    displayName: 'Inspect project',
    resultComponent: ProjectToolResult,
  },
  'tool-createProject': {
    displayName: 'Create project',
    resultComponent: ProjectToolResult,
  },
  'tool-updateProject': {
    displayName: 'Update project',
    resultComponent: ProjectToolResult,
  },
  'tool-requestDeleteProject': {
    displayName: 'Delete project',
    resultComponent: DeleteRequestToolResult,
  },
  'tool-listTeams': {
    displayName: 'List teams',
    resultComponent: DefaultAssistantToolResult,
  },
  'tool-getTeam': {
    displayName: 'Inspect team',
    resultComponent: TeamToolResult,
  },
  'tool-createTeam': {
    displayName: 'Create team',
    resultComponent: TeamToolResult,
  },
  'tool-updateTeam': {
    displayName: 'Update team',
    resultComponent: TeamToolResult,
  },
  'tool-requestDeleteTeam': {
    displayName: 'Delete team',
    resultComponent: DeleteRequestToolResult,
  },
  'tool-addTeamMember': { displayName: 'Add team member' },
  'tool-removeTeamMember': { displayName: 'Remove team member' },
  'tool-changeTeamLead': { displayName: 'Change team lead' },
  'tool-addProjectMember': { displayName: 'Add project member' },
  'tool-removeProjectMember': { displayName: 'Remove project member' },
  'tool-changeProjectLead': { displayName: 'Change project lead' },
  'tool-assignIssue': { displayName: 'Assign issue' },
  'tool-unassignIssue': { displayName: 'Unassign issue' },
  'tool-createFolder': { displayName: 'Create folder' },
  'tool-updateFolder': { displayName: 'Update folder' },
  'tool-requestDeleteFolder': {
    displayName: 'Delete folder',
    resultComponent: DeleteRequestToolResult,
  },
  'tool-moveDocumentToFolder': { displayName: 'Move document' },
  'tool-listFolders': { displayName: 'List folders' },
  'tool-performClientAction': { displayName: 'Navigate' },
  'tool-previewEmail': {
    displayName: 'Email preview',
    resultComponent: EmailPreviewResult,
  },
  'tool-sendEmailToMember': { displayName: 'Send email' },
  'tool-requestBulkDelete': {
    displayName: 'Bulk delete',
    resultComponent: DeleteRequestToolResult,
  },
  'tool-changeIssueKey': { displayName: 'Change issue key' },
  'tool-renameMember': { displayName: 'Rename member' },
  'tool-showIssues': {
    displayName: 'Issues',
    resultComponent: EntityListResult,
    callComponent: DefaultAssistantToolCall,
  },
  'tool-showProjects': {
    displayName: 'Projects',
    resultComponent: EntityListResult,
    callComponent: DefaultAssistantToolCall,
  },
  'tool-showTeams': {
    displayName: 'Teams',
    resultComponent: EntityListResult,
    callComponent: DefaultAssistantToolCall,
  },
  'tool-showDocuments': {
    displayName: 'Documents',
    resultComponent: EntityListResult,
    callComponent: DefaultAssistantToolCall,
  },
};

export function getAssistantToolConfig(toolType: string): AssistantToolConfig {
  return (
    toolConfigs[normalizeToolType(toolType)] ?? {
      displayName: toTitleCase(toolType),
      callComponent: DefaultAssistantToolCall,
      resultComponent: DefaultAssistantToolResult,
    }
  );
}

export function AssistantToolRenderer({ tool }: AssistantToolComponentProps) {
  const config = getAssistantToolConfig(tool.type);
  const isResult =
    tool.state === 'output-available' ||
    tool.state === 'output-error' ||
    tool.output != null;

  const Component = isResult
    ? (config.resultComponent ?? DefaultAssistantToolResult)
    : (config.callComponent ?? DefaultAssistantToolCall);

  return (
    <Fragment>
      <Component tool={tool} />
    </Fragment>
  );
}
