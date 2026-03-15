'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
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
} from 'lucide-react';

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const { permissions: createPermissions, isLoading: arePermissionsLoading } =
    useScopedPermissions({ orgSlug }, [
      PERMISSIONS.ISSUE_CREATE,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.TEAM_CREATE,
      PERMISSIONS.DOCUMENT_CREATE,
    ]);

  const activePage = pages[pages.length - 1];

  // Search entities when user types (debounced via Convex reactivity)
  const searchResults = useQuery(
    api.search.queries.searchEntities,
    search.length >= 2 ? { orgSlug, query: search, limit: 5 } : 'skip',
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

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title='Command Menu'
      description='Search or jump to anything...'
    >
      <Command onKeyDown={onKeyDown} loop>
        <CommandInput
          placeholder={
            activePage === 'create'
              ? 'What do you want to create?'
              : 'Type a command or search...'
          }
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

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
                  </CommandGroup>
                </>
              )}
            </>
          )}

          {/* Create sub-page */}
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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
