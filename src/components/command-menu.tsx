'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/lib/convex';
import { useScopedPermissions } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { DynamicIcon } from '@/lib/dynamic-icons';
import {
  CheckSquare,
  FolderOpen,
  Users,
  LayoutDashboard,
  FileText,
  Settings,
  Plus,
  Circle,
  ArrowRight,
  Pencil,
  UserPlus,
  Eye,
  MessageSquare,
  Check,
  Signal,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';

type PageContext =
  | { type: 'issue'; issueKey: string }
  | { type: 'team'; teamKey: string }
  | { type: 'project'; projectKey: string }
  | null;

function parsePageContext(pathname: string, orgSlug: string): PageContext {
  const prefix = `/${orgSlug}`;
  const rest = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname;

  const issueMatch = rest.match(/^\/issues\/([A-Za-z]+-\d+)$/);
  if (issueMatch) return { type: 'issue', issueKey: issueMatch[1] };

  const teamMatch = rest.match(/^\/teams\/([A-Za-z0-9_-]+)$/);
  if (teamMatch) return { type: 'team', teamKey: teamMatch[1] };

  const projectMatch = rest.match(/^\/projects\/([A-Za-z0-9_-]+)$/);
  if (projectMatch) return { type: 'project', projectKey: projectMatch[1] };

  return null;
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const orgSlug = params.orgSlug as string;
  const { permissions: createPermissions, isLoading: arePermissionsLoading } =
    useScopedPermissions({ orgSlug }, [
      PERMISSIONS.ISSUE_CREATE,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.TEAM_CREATE,
      PERMISSIONS.DOCUMENT_CREATE,
    ]);

  const activePage = pages[pages.length - 1];

  // Detect current page context
  const pageContext = useMemo(
    () => parsePageContext(pathname, orgSlug),
    [pathname, orgSlug],
  );

  // Search entities when user types (debounced via Convex reactivity)
  const searchResults = useQuery(
    api.search.queries.searchEntities,
    search.length >= 2 ? { orgSlug, query: search, limit: 5 } : 'skip',
  );

  // Fetch workspace options when command menu is open and on a contextual page
  const workspaceOptions = useQuery(
    api.organizations.queries.getWorkspaceOptions,
    open && pageContext ? { orgSlug } : 'skip',
  );

  // Fetch current entity data when on a contextual page
  const issueData = useQuery(
    api.issues.queries.getByKey,
    open && pageContext?.type === 'issue'
      ? { orgSlug, issueKey: pageContext.issueKey }
      : 'skip',
  );
  const teamData = useQuery(
    api.teams.queries.getByKey,
    open && pageContext?.type === 'team'
      ? { orgSlug, teamKey: pageContext.teamKey }
      : 'skip',
  );
  const projectData = useQuery(
    api.projects.queries.getByKey,
    open && pageContext?.type === 'project'
      ? { orgSlug, projectKey: pageContext.projectKey }
      : 'skip',
  );

  // Issue mutations
  const changeWorkflowState = useMutation(
    api.issues.mutations.changeWorkflowState,
  );
  const changePriority = useMutation(api.issues.mutations.changePriority);
  const changeIssueTeam = useMutation(api.issues.mutations.changeTeam);
  const changeIssueProject = useMutation(api.issues.mutations.changeProject);
  const updateAssignees = useMutation(api.issues.mutations.updateAssignees);
  const changeIssueVisibility = useMutation(
    api.issues.mutations.changeVisibility,
  );

  // Team mutations
  const updateTeam = useMutation(api.teams.mutations.update);
  const changeTeamVisibility = useMutation(
    api.teams.mutations.changeVisibility,
  );

  // Project mutations
  const changeProjectStatus = useMutation(api.projects.mutations.changeStatus);
  const changeProjectTeam = useMutation(api.projects.mutations.changeTeam);
  const changeProjectLead = useMutation(api.projects.mutations.changeLead);
  const changeProjectVisibility = useMutation(
    api.projects.mutations.changeVisibility,
  );

  // Global keyboard listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset state when dialog closes
  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value);
    if (!value) {
      setSearch('');
      setPages([]);
    }
  }, []);

  const runCommand = useCallback(
    (command: () => void) => {
      handleOpenChange(false);
      command();
    },
    [handleOpenChange],
  );

  const navigate = useCallback(
    (path: string) => {
      runCommand(() => router.push(path));
    },
    [runCommand, router],
  );

  const goToSubPage = useCallback((page: string) => {
    setPages(prev => [...prev, page]);
    setSearch('');
  }, []);

  // Handle backspace to go back in pages
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !search && pages.length > 0) {
        e.preventDefault();
        setPages(prev => prev.slice(0, -1));
      }
      if (e.key === 'Escape' && pages.length > 0) {
        e.preventDefault();
        setPages(prev => prev.slice(0, -1));
      }
    },
    [search, pages.length],
  );

  if (!orgSlug) return null;

  const hasSearch = search.length >= 2;
  const hasResults =
    searchResults &&
    (searchResults.issues.length > 0 ||
      searchResults.projects.length > 0 ||
      searchResults.teams.length > 0 ||
      searchResults.documents.length > 0);
  const canCreateIssue = createPermissions[PERMISSIONS.ISSUE_CREATE] ?? false;
  const canCreateProject =
    createPermissions[PERMISSIONS.PROJECT_CREATE] ?? false;
  const canCreateTeam = createPermissions[PERMISSIONS.TEAM_CREATE] ?? false;
  const canCreateDocument =
    createPermissions[PERMISSIONS.DOCUMENT_CREATE] ?? false;
  const hasCreateCommands =
    canCreateIssue || canCreateProject || canCreateTeam || canCreateDocument;

  // Determine placeholder text based on active sub-page
  const getPlaceholder = () => {
    switch (activePage) {
      case 'create':
        return 'What do you want to create?';
      case 'issue-status':
        return 'Select a status...';
      case 'issue-priority':
        return 'Select a priority...';
      case 'issue-team':
      case 'project-team':
        return 'Select a team...';
      case 'issue-project':
        return 'Select a project...';
      case 'issue-assignee':
        return 'Select an assignee...';
      case 'issue-visibility':
      case 'team-visibility':
      case 'project-visibility':
        return 'Select visibility...';
      case 'team-lead':
      case 'project-lead':
        return 'Select a lead...';
      case 'project-status':
        return 'Select a status...';
      default:
        return 'Type a command or search...';
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title='Command Menu'
      description='Search or jump to anything...'
    >
      <Command onKeyDown={onKeyDown} loop>
        <CommandInput
          placeholder={getPlaceholder()}
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* ── Root page ── */}
          {!activePage && (
            <>
              {/* Search results */}
              {hasSearch && hasResults && (
                <>
                  {searchResults.issues.length > 0 && (
                    <CommandGroup heading='Issues'>
                      {searchResults.issues.map(issue => (
                        <CommandItem
                          key={issue._id}
                          value={`issue-${issue.key}-${issue.title}`}
                          onSelect={() =>
                            navigate(`/${orgSlug}/issues/${issue.key}`)
                          }
                        >
                          {issue.stateIcon ? (
                            <DynamicIcon
                              name={issue.stateIcon}
                              fallback={Circle}
                              className='size-4 shrink-0'
                              style={{ color: issue.stateColor || '#6b7280' }}
                            />
                          ) : (
                            <Circle className='text-muted-foreground size-4 shrink-0' />
                          )}
                          <span className='flex-1 truncate'>
                            <span className='text-muted-foreground mr-1.5 text-xs'>
                              {issue.key}
                            </span>
                            {issue.title}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {searchResults.projects.length > 0 && (
                    <CommandGroup heading='Projects'>
                      {searchResults.projects.map(project => (
                        <CommandItem
                          key={project._id}
                          value={`project-${project.key}-${project.name}`}
                          onSelect={() =>
                            navigate(`/${orgSlug}/projects/${project.key}`)
                          }
                        >
                          {project.icon ? (
                            <DynamicIcon
                              name={project.icon}
                              fallback={FolderOpen}
                              className='size-4 shrink-0'
                              style={{ color: project.color || '#6b7280' }}
                            />
                          ) : (
                            <FolderOpen className='text-muted-foreground size-4 shrink-0' />
                          )}
                          <span className='truncate'>{project.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {searchResults.teams.length > 0 && (
                    <CommandGroup heading='Teams'>
                      {searchResults.teams.map(team => (
                        <CommandItem
                          key={team._id}
                          value={`team-${team.key}-${team.name}`}
                          onSelect={() =>
                            navigate(`/${orgSlug}/teams/${team.key}`)
                          }
                        >
                          {team.icon ? (
                            <DynamicIcon
                              name={team.icon}
                              fallback={Users}
                              className='size-4 shrink-0'
                              style={{ color: team.color || '#6b7280' }}
                            />
                          ) : (
                            <Users className='text-muted-foreground size-4 shrink-0' />
                          )}
                          <span className='truncate'>{team.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {searchResults.documents.length > 0 && (
                    <CommandGroup heading='Documents'>
                      {searchResults.documents.map(doc => (
                        <CommandItem
                          key={doc._id}
                          value={`doc-${doc._id}-${doc.title}`}
                          onSelect={() =>
                            navigate(`/${orgSlug}/documents/${doc._id}`)
                          }
                        >
                          {doc.icon ? (
                            <DynamicIcon
                              name={doc.icon}
                              fallback={FileText}
                              className='size-4 shrink-0'
                              style={{ color: doc.color || '#6b7280' }}
                            />
                          ) : (
                            <FileText className='text-muted-foreground size-4 shrink-0' />
                          )}
                          <span className='truncate'>{doc.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  <CommandSeparator />
                </>
              )}

              {/* ── Issue context actions ── */}
              {pageContext?.type === 'issue' && issueData && (
                <>
                  <CommandGroup heading={`Issue ${pageContext.issueKey}`}>
                    <CommandItem
                      value='issue-change-status'
                      onSelect={() => goToSubPage('issue-status')}
                    >
                      <Circle className='size-4 shrink-0' />
                      <span>Change Status...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='issue-change-priority'
                      onSelect={() => goToSubPage('issue-priority')}
                    >
                      <Signal className='size-4 shrink-0' />
                      <span>Change Priority...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='issue-change-assignee'
                      onSelect={() => goToSubPage('issue-assignee')}
                    >
                      <UserPlus className='size-4 shrink-0' />
                      <span>Change Assignee...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='issue-change-team'
                      onSelect={() => goToSubPage('issue-team')}
                    >
                      <Users className='size-4 shrink-0' />
                      <span>Change Team...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='issue-change-project'
                      onSelect={() => goToSubPage('issue-project')}
                    >
                      <FolderOpen className='size-4 shrink-0' />
                      <span>Change Project...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='issue-change-visibility'
                      onSelect={() => goToSubPage('issue-visibility')}
                    >
                      <Eye className='size-4 shrink-0' />
                      <span>Change Visibility...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='issue-edit-title'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent('command-menu:edit-issue-title'),
                          ),
                        )
                      }
                    >
                      <Pencil className='size-4 shrink-0' />
                      <span>Edit Title</span>
                    </CommandItem>
                    <CommandItem
                      value='issue-edit-description'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent(
                              'command-menu:edit-issue-description',
                            ),
                          ),
                        )
                      }
                    >
                      <Pencil className='size-4 shrink-0' />
                      <span>Edit Description</span>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* ── Team context actions ── */}
              {pageContext?.type === 'team' && teamData && (
                <>
                  <CommandGroup heading={`Team ${teamData.name}`}>
                    <CommandItem
                      value='team-change-lead'
                      onSelect={() => goToSubPage('team-lead')}
                    >
                      <Target className='size-4 shrink-0' />
                      <span>Change Lead...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='team-change-visibility'
                      onSelect={() => goToSubPage('team-visibility')}
                    >
                      <Eye className='size-4 shrink-0' />
                      <span>Change Visibility...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='team-edit-name'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent('command-menu:edit-team-name'),
                          ),
                        )
                      }
                    >
                      <Pencil className='size-4 shrink-0' />
                      <span>Edit Name</span>
                    </CommandItem>
                    <CommandItem
                      value='team-edit-description'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent(
                              'command-menu:edit-team-description',
                            ),
                          ),
                        )
                      }
                    >
                      <Pencil className='size-4 shrink-0' />
                      <span>Edit Description</span>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* ── Project context actions ── */}
              {pageContext?.type === 'project' && projectData && (
                <>
                  <CommandGroup heading={`Project ${projectData.name}`}>
                    <CommandItem
                      value='project-change-status'
                      onSelect={() => goToSubPage('project-status')}
                    >
                      <Circle className='size-4 shrink-0' />
                      <span>Change Status...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='project-change-team'
                      onSelect={() => goToSubPage('project-team')}
                    >
                      <Users className='size-4 shrink-0' />
                      <span>Change Team...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='project-change-lead'
                      onSelect={() => goToSubPage('project-lead')}
                    >
                      <Target className='size-4 shrink-0' />
                      <span>Change Lead...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='project-change-visibility'
                      onSelect={() => goToSubPage('project-visibility')}
                    >
                      <Eye className='size-4 shrink-0' />
                      <span>Change Visibility...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='project-edit-name'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent('command-menu:edit-project-name'),
                          ),
                        )
                      }
                    >
                      <Pencil className='size-4 shrink-0' />
                      <span>Edit Name</span>
                    </CommandItem>
                    <CommandItem
                      value='project-edit-description'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent(
                              'command-menu:edit-project-description',
                            ),
                          ),
                        )
                      }
                    >
                      <Pencil className='size-4 shrink-0' />
                      <span>Edit Description</span>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* Navigation */}
              <CommandGroup heading='Go to'>
                <CommandItem
                  value='go-issues'
                  onSelect={() => navigate(`/${orgSlug}/issues`)}
                >
                  <CheckSquare className='size-4 shrink-0' />
                  <span>Issues</span>
                </CommandItem>
                <CommandItem
                  value='go-projects'
                  onSelect={() => navigate(`/${orgSlug}/projects`)}
                >
                  <FolderOpen className='size-4 shrink-0' />
                  <span>Projects</span>
                </CommandItem>
                <CommandItem
                  value='go-teams'
                  onSelect={() => navigate(`/${orgSlug}/teams`)}
                >
                  <Users className='size-4 shrink-0' />
                  <span>Teams</span>
                </CommandItem>
                <CommandItem
                  value='go-dashboard'
                  onSelect={() => navigate(`/${orgSlug}/dashboard`)}
                >
                  <LayoutDashboard className='size-4 shrink-0' />
                  <span>Dashboard</span>
                </CommandItem>
                <CommandItem
                  value='go-documents'
                  onSelect={() => navigate(`/${orgSlug}/documents`)}
                >
                  <FileText className='size-4 shrink-0' />
                  <span>Documents</span>
                </CommandItem>
                <CommandItem
                  value='go-settings'
                  onSelect={() => navigate(`/${orgSlug}/settings`)}
                >
                  <Settings className='size-4 shrink-0' />
                  <span>Settings</span>
                </CommandItem>
              </CommandGroup>

              {/* Actions */}
              {!arePermissionsLoading && hasCreateCommands && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading='Actions'>
                    <CommandItem
                      value='create'
                      onSelect={() => {
                        setPages(['create']);
                        setSearch('');
                      }}
                    >
                      <Plus className='size-4 shrink-0' />
                      <span>Create...</span>
                      <CommandShortcut>
                        <ArrowRight className='size-3' />
                      </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                      value='ask-vector message-assistant chat-ai'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent('command-menu:focus-assistant'),
                          ),
                        )
                      }
                    >
                      <MessageSquare className='size-4 shrink-0' />
                      <span>Message Vector...</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}

              {/* Show "Message Vector" even without create perms */}
              {!arePermissionsLoading && !hasCreateCommands && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading='Actions'>
                    <CommandItem
                      value='ask-vector message-assistant chat-ai'
                      onSelect={() =>
                        runCommand(() =>
                          window.dispatchEvent(
                            new CustomEvent('command-menu:focus-assistant'),
                          ),
                        )
                      }
                    >
                      <MessageSquare className='size-4 shrink-0' />
                      <span>Message Vector...</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </>
          )}

          {/* ── Create sub-page ── */}
          {activePage === 'create' && hasCreateCommands && (
            <CommandGroup heading='Create new'>
              {canCreateIssue && (
                <CommandItem
                  value='create-issue'
                  onSelect={() => {
                    runCommand(() => {
                      window.dispatchEvent(
                        new CustomEvent('command-menu:create-issue'),
                      );
                    });
                  }}
                >
                  <CheckSquare className='size-4 shrink-0' />
                  <span>New Issue</span>
                  <CommandShortcut>C</CommandShortcut>
                </CommandItem>
              )}
              {canCreateProject && (
                <CommandItem
                  value='create-project'
                  onSelect={() => {
                    runCommand(() => {
                      window.dispatchEvent(
                        new CustomEvent('command-menu:create-project'),
                      );
                    });
                  }}
                >
                  <FolderOpen className='size-4 shrink-0' />
                  <span>New Project</span>
                </CommandItem>
              )}
              {canCreateTeam && (
                <CommandItem
                  value='create-team'
                  onSelect={() => {
                    runCommand(() => {
                      window.dispatchEvent(
                        new CustomEvent('command-menu:create-team'),
                      );
                    });
                  }}
                >
                  <Users className='size-4 shrink-0' />
                  <span>New Team</span>
                </CommandItem>
              )}
              {canCreateDocument && (
                <CommandItem
                  value='create-document'
                  onSelect={() => {
                    runCommand(() => {
                      window.dispatchEvent(
                        new CustomEvent('command-menu:create-document'),
                      );
                    });
                  }}
                >
                  <FileText className='size-4 shrink-0' />
                  <span>New Document</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}

          {/* ── Issue: Change Status sub-page ── */}
          {activePage === 'issue-status' && issueData && workspaceOptions && (
            <CommandGroup heading='Change Status'>
              {workspaceOptions.issueStates.map(state => (
                <CommandItem
                  key={state._id}
                  value={`state-${state.name}`}
                  onSelect={() =>
                    runCommand(() => {
                      void changeWorkflowState({
                        issueId: issueData._id,
                        stateId: state._id,
                      }).then(() =>
                        toast.success(`Status changed to ${state.name}`),
                      );
                    })
                  }
                >
                  {state.icon ? (
                    <DynamicIcon
                      name={state.icon}
                      fallback={Circle}
                      className='size-4 shrink-0'
                      style={{ color: state.color || '#6b7280' }}
                    />
                  ) : (
                    <Circle
                      className='size-4 shrink-0'
                      style={{ color: state.color || '#6b7280' }}
                    />
                  )}
                  <span>{state.name}</span>
                  {issueData.workflowStateId === state._id && (
                    <Check className='text-muted-foreground ml-auto size-3' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Issue: Change Priority sub-page ── */}
          {activePage === 'issue-priority' && issueData && workspaceOptions && (
            <CommandGroup heading='Change Priority'>
              {workspaceOptions.issuePriorities.map(priority => (
                <CommandItem
                  key={priority._id}
                  value={`priority-${priority.name}`}
                  onSelect={() =>
                    runCommand(() => {
                      void changePriority({
                        issueId: issueData._id,
                        priorityId: priority._id,
                      }).then(() =>
                        toast.success(`Priority changed to ${priority.name}`),
                      );
                    })
                  }
                >
                  {priority.icon ? (
                    <DynamicIcon
                      name={priority.icon}
                      fallback={Signal}
                      className='size-4 shrink-0'
                      style={{ color: priority.color || '#6b7280' }}
                    />
                  ) : (
                    <Signal className='size-4 shrink-0' />
                  )}
                  <span>{priority.name}</span>
                  {issueData.priorityId === priority._id && (
                    <Check className='text-muted-foreground ml-auto size-3' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Issue: Change Assignee sub-page ── */}
          {activePage === 'issue-assignee' && issueData && workspaceOptions && (
            <CommandGroup heading='Set Assignee'>
              <CommandItem
                value='assignee-none-unassigned'
                onSelect={() =>
                  runCommand(() => {
                    void updateAssignees({
                      issueId: issueData._id,
                      assigneeIds: [],
                    }).then(() => toast.success('Assignees cleared'));
                  })
                }
              >
                <Circle className='text-muted-foreground size-4 shrink-0' />
                <span>Unassigned</span>
              </CommandItem>
              {workspaceOptions.members.map(member => (
                <CommandItem
                  key={member._id}
                  value={`assignee-${member.user?.name ?? ''}-${member.user?.email ?? ''}`}
                  onSelect={() =>
                    runCommand(() => {
                      void updateAssignees({
                        issueId: issueData._id,
                        assigneeIds: [member.userId],
                      }).then(() =>
                        toast.success(
                          `Assigned to ${member.user?.name || member.user?.email}`,
                        ),
                      );
                    })
                  }
                >
                  <UserPlus className='size-4 shrink-0' />
                  <span>{member.user?.name || member.user?.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Issue: Change Team sub-page ── */}
          {activePage === 'issue-team' && issueData && workspaceOptions && (
            <CommandGroup heading='Change Team'>
              <CommandItem
                value='team-none-unset'
                onSelect={() =>
                  runCommand(() => {
                    void changeIssueTeam({
                      issueId: issueData._id,
                      teamId: null,
                    }).then(() => toast.success('Team removed'));
                  })
                }
              >
                <Circle className='text-muted-foreground size-4 shrink-0' />
                <span>No Team</span>
              </CommandItem>
              {workspaceOptions.teams.map(team => (
                <CommandItem
                  key={team._id}
                  value={`team-${team.key}-${team.name}`}
                  onSelect={() =>
                    runCommand(() => {
                      void changeIssueTeam({
                        issueId: issueData._id,
                        teamId: team._id,
                      }).then(() =>
                        toast.success(`Team changed to ${team.name}`),
                      );
                    })
                  }
                >
                  {team.icon ? (
                    <DynamicIcon
                      name={team.icon}
                      fallback={Users}
                      className='size-4 shrink-0'
                      style={{ color: team.color || '#6b7280' }}
                    />
                  ) : (
                    <Users className='size-4 shrink-0' />
                  )}
                  <span>{team.name}</span>
                  {issueData.teamId === team._id && (
                    <Check className='text-muted-foreground ml-auto size-3' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Issue: Change Project sub-page ── */}
          {activePage === 'issue-project' && issueData && workspaceOptions && (
            <CommandGroup heading='Change Project'>
              <CommandItem
                value='project-none-unset'
                onSelect={() =>
                  runCommand(() => {
                    void changeIssueProject({
                      issueId: issueData._id,
                      projectId: null,
                    }).then(() => toast.success('Project removed'));
                  })
                }
              >
                <Circle className='text-muted-foreground size-4 shrink-0' />
                <span>No Project</span>
              </CommandItem>
              {workspaceOptions.projects.map(project => (
                <CommandItem
                  key={project._id}
                  value={`project-${project.key}-${project.name}`}
                  onSelect={() =>
                    runCommand(() => {
                      void changeIssueProject({
                        issueId: issueData._id,
                        projectId: project._id,
                      }).then(() =>
                        toast.success(`Project changed to ${project.name}`),
                      );
                    })
                  }
                >
                  {project.icon ? (
                    <DynamicIcon
                      name={project.icon}
                      fallback={FolderOpen}
                      className='size-4 shrink-0'
                      style={{ color: project.color || '#6b7280' }}
                    />
                  ) : (
                    <FolderOpen className='size-4 shrink-0' />
                  )}
                  <span>{project.name}</span>
                  {issueData.projectId === project._id && (
                    <Check className='text-muted-foreground ml-auto size-3' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Issue: Change Visibility sub-page ── */}
          {activePage === 'issue-visibility' && issueData && (
            <CommandGroup heading='Change Visibility'>
              {(['private', 'organization', 'public'] as const).map(
                visibility => (
                  <CommandItem
                    key={visibility}
                    value={`visibility-${visibility}`}
                    onSelect={() =>
                      runCommand(() => {
                        void changeIssueVisibility({
                          issueId: issueData._id,
                          visibility,
                        }).then(() =>
                          toast.success(`Visibility changed to ${visibility}`),
                        );
                      })
                    }
                  >
                    <Eye className='size-4 shrink-0' />
                    <span className='capitalize'>{visibility}</span>
                    {issueData.visibility === visibility && (
                      <Check className='text-muted-foreground ml-auto size-3' />
                    )}
                  </CommandItem>
                ),
              )}
            </CommandGroup>
          )}

          {/* ── Team: Change Lead sub-page ── */}
          {activePage === 'team-lead' && teamData && workspaceOptions && (
            <CommandGroup heading='Change Team Lead'>
              {workspaceOptions.members.map(member => (
                <CommandItem
                  key={member._id}
                  value={`lead-${member.user?.name ?? ''}-${member.user?.email ?? ''}`}
                  onSelect={() =>
                    runCommand(() => {
                      void updateTeam({
                        teamId: teamData._id,
                        data: { leadId: member.userId },
                      }).then(() =>
                        toast.success(
                          `Lead changed to ${member.user?.name || member.user?.email}`,
                        ),
                      );
                    })
                  }
                >
                  <Target className='size-4 shrink-0' />
                  <span>{member.user?.name || member.user?.email}</span>
                  {teamData.leadId === member.userId && (
                    <Check className='text-muted-foreground ml-auto size-3' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Team: Change Visibility sub-page ── */}
          {activePage === 'team-visibility' && teamData && (
            <CommandGroup heading='Change Visibility'>
              {(['private', 'organization', 'public'] as const).map(
                visibility => (
                  <CommandItem
                    key={visibility}
                    value={`visibility-${visibility}`}
                    onSelect={() =>
                      runCommand(() => {
                        void changeTeamVisibility({
                          teamId: teamData._id,
                          visibility,
                        }).then(() =>
                          toast.success(`Visibility changed to ${visibility}`),
                        );
                      })
                    }
                  >
                    <Eye className='size-4 shrink-0' />
                    <span className='capitalize'>{visibility}</span>
                    {teamData.visibility === visibility && (
                      <Check className='text-muted-foreground ml-auto size-3' />
                    )}
                  </CommandItem>
                ),
              )}
            </CommandGroup>
          )}

          {/* ── Project: Change Status sub-page ── */}
          {activePage === 'project-status' &&
            projectData &&
            workspaceOptions && (
              <CommandGroup heading='Change Status'>
                <CommandItem
                  value='status-none-unset'
                  onSelect={() =>
                    runCommand(() => {
                      void changeProjectStatus({
                        projectId: projectData._id,
                        statusId: null,
                      }).then(() => toast.success('Status removed'));
                    })
                  }
                >
                  <Circle className='text-muted-foreground size-4 shrink-0' />
                  <span>No Status</span>
                </CommandItem>
                {workspaceOptions.projectStatuses.map(status => (
                  <CommandItem
                    key={status._id}
                    value={`status-${status.name}`}
                    onSelect={() =>
                      runCommand(() => {
                        void changeProjectStatus({
                          projectId: projectData._id,
                          statusId: status._id,
                        }).then(() =>
                          toast.success(`Status changed to ${status.name}`),
                        );
                      })
                    }
                  >
                    {status.icon ? (
                      <DynamicIcon
                        name={status.icon}
                        fallback={Circle}
                        className='size-4 shrink-0'
                        style={{ color: status.color || '#6b7280' }}
                      />
                    ) : (
                      <Circle
                        className='size-4 shrink-0'
                        style={{ color: status.color || '#6b7280' }}
                      />
                    )}
                    <span>{status.name}</span>
                    {projectData.statusId === status._id && (
                      <Check className='text-muted-foreground ml-auto size-3' />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

          {/* ── Project: Change Team sub-page ── */}
          {activePage === 'project-team' && projectData && workspaceOptions && (
            <CommandGroup heading='Change Team'>
              <CommandItem
                value='team-none-unset'
                onSelect={() =>
                  runCommand(() => {
                    void changeProjectTeam({
                      projectId: projectData._id,
                      teamId: null,
                    }).then(() => toast.success('Team removed'));
                  })
                }
              >
                <Circle className='text-muted-foreground size-4 shrink-0' />
                <span>No Team</span>
              </CommandItem>
              {workspaceOptions.teams.map(team => (
                <CommandItem
                  key={team._id}
                  value={`team-${team.key}-${team.name}`}
                  onSelect={() =>
                    runCommand(() => {
                      void changeProjectTeam({
                        projectId: projectData._id,
                        teamId: team._id,
                      }).then(() =>
                        toast.success(`Team changed to ${team.name}`),
                      );
                    })
                  }
                >
                  {team.icon ? (
                    <DynamicIcon
                      name={team.icon}
                      fallback={Users}
                      className='size-4 shrink-0'
                      style={{ color: team.color || '#6b7280' }}
                    />
                  ) : (
                    <Users className='size-4 shrink-0' />
                  )}
                  <span>{team.name}</span>
                  {projectData.teamId === team._id && (
                    <Check className='text-muted-foreground ml-auto size-3' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Project: Change Lead sub-page ── */}
          {activePage === 'project-lead' && projectData && workspaceOptions && (
            <CommandGroup heading='Change Lead'>
              <CommandItem
                value='lead-none-unset'
                onSelect={() =>
                  runCommand(() => {
                    void changeProjectLead({
                      projectId: projectData._id,
                      leadId: null,
                    }).then(() => toast.success('Lead removed'));
                  })
                }
              >
                <Circle className='text-muted-foreground size-4 shrink-0' />
                <span>No Lead</span>
              </CommandItem>
              {workspaceOptions.members.map(member => (
                <CommandItem
                  key={member._id}
                  value={`lead-${member.user?.name ?? ''}-${member.user?.email ?? ''}`}
                  onSelect={() =>
                    runCommand(() => {
                      void changeProjectLead({
                        projectId: projectData._id,
                        leadId: member.userId,
                      }).then(() =>
                        toast.success(
                          `Lead changed to ${member.user?.name || member.user?.email}`,
                        ),
                      );
                    })
                  }
                >
                  <Target className='size-4 shrink-0' />
                  <span>{member.user?.name || member.user?.email}</span>
                  {projectData.leadId === member.userId && (
                    <Check className='text-muted-foreground ml-auto size-3' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* ── Project: Change Visibility sub-page ── */}
          {activePage === 'project-visibility' && projectData && (
            <CommandGroup heading='Change Visibility'>
              {(['private', 'organization', 'public'] as const).map(
                visibility => (
                  <CommandItem
                    key={visibility}
                    value={`visibility-${visibility}`}
                    onSelect={() =>
                      runCommand(() => {
                        void changeProjectVisibility({
                          projectId: projectData._id,
                          visibility,
                        }).then(() =>
                          toast.success(`Visibility changed to ${visibility}`),
                        );
                      })
                    }
                  >
                    <Eye className='size-4 shrink-0' />
                    <span className='capitalize'>{visibility}</span>
                    {projectData.visibility === visibility && (
                      <Check className='text-muted-foreground ml-auto size-3' />
                    )}
                  </CommandItem>
                ),
              )}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
