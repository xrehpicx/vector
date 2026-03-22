'use client';

import { useEffect, useState } from 'react';
import type { Id } from '@/convex/_generated/dataModel';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import Markdown from 'react-markdown';
import {
  Building,
  Check,
  ChevronsUpDown,
  FileText,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Plus,
  Trash2,
  Twitter,
  X,
  Youtube,
} from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  OrgLogoEditor,
  OrgNameEditor,
  OrgSlugEditor,
} from '@/components/organization';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { RichEditor } from '@/components/ui/rich-editor';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SOCIAL_LINK_LABELS,
  SOCIAL_LINK_PLATFORMS,
  type SocialLink,
  type SocialLinkPlatform,
} from '@/lib/social-links';
import { updateQuery } from '@/lib/optimistic-updates';

interface OrgSettingsPageClientProps {
  orgSlug: string;
}

function SocialIcon({ platform }: { platform: SocialLinkPlatform }) {
  switch (platform) {
    case 'github':
      return <Github className='size-3.5' />;
    case 'x':
      return <Twitter className='size-3.5' />;
    case 'linkedin':
      return <Linkedin className='size-3.5' />;
    case 'youtube':
      return <Youtube className='size-3.5' />;
    case 'instagram':
      return <Instagram className='size-3.5' />;
    case 'website':
    default:
      return <Globe className='size-3.5' />;
  }
}

function serializeSocialLinks(links: SocialLink[]) {
  return JSON.stringify(links);
}

function PublicViewSelector({
  views,
  value,
  disabled,
  onChange,
}: {
  views: Array<{ _id: Id<'views'>; name: string }>;
  value: Id<'views'> | null;
  disabled: boolean;
  onChange: (value: Id<'views'> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedView = views.find(view => view._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          className='h-8 w-full justify-between px-2 text-sm'
          disabled={disabled}
        >
          <span className='truncate'>
            {selectedView?.name ?? 'No public landing view'}
          </span>
          <ChevronsUpDown className='text-muted-foreground size-3.5' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[320px] p-0' align='start'>
        <Command>
          <CommandInput placeholder='Search public views...' />
          <CommandList>
            <CommandEmpty>No public views found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value='none'
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <span>No public landing view</span>
                {value === null ? (
                  <Check className='text-muted-foreground ml-auto size-3.5' />
                ) : null}
              </CommandItem>
              {views.map(view => (
                <CommandItem
                  key={view._id}
                  value={view.name}
                  onSelect={() => {
                    onChange(view._id);
                    setOpen(false);
                  }}
                >
                  <span className='truncate'>{view.name}</span>
                  {value === view._id ? (
                    <Check className='text-muted-foreground ml-auto size-3.5' />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AgentContextDocumentSelector({
  documents,
  value,
  disabled,
  onChange,
}: {
  documents: Array<{ _id: Id<'documents'>; title: string }>;
  value: Id<'documents'> | null;
  disabled: boolean;
  onChange: (value: Id<'documents'> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDoc = documents.find(doc => doc._id === value);

  return (
    <div className='flex items-center gap-2'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            className='h-8 w-full justify-between px-2 text-sm'
            disabled={disabled}
          >
            <span className='flex items-center gap-1.5 truncate'>
              <FileText className='text-muted-foreground size-3.5 shrink-0' />
              {selectedDoc?.title ?? 'No context document'}
            </span>
            <ChevronsUpDown className='text-muted-foreground size-3.5 shrink-0' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[320px] p-0' align='start'>
          <Command>
            <CommandInput placeholder='Search documents...' />
            <CommandList>
              <CommandEmpty>No documents found.</CommandEmpty>
              <CommandGroup>
                {documents.map(doc => (
                  <CommandItem
                    key={doc._id}
                    value={doc.title}
                    onSelect={() => {
                      onChange(doc._id);
                      setOpen(false);
                    }}
                  >
                    <FileText className='text-muted-foreground mr-1.5 size-3.5 shrink-0' />
                    <span className='truncate'>{doc.title}</span>
                    {value === doc._id ? (
                      <Check className='text-muted-foreground ml-auto size-3.5 shrink-0' />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-8 w-8 shrink-0 p-0'
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <X className='size-3.5' />
        </Button>
      ) : null}
    </div>
  );
}

function SocialPlatformSelector({
  value,
  disabled,
  usedPlatforms,
  onChange,
}: {
  value: SocialLinkPlatform;
  disabled: boolean;
  usedPlatforms: SocialLinkPlatform[];
  onChange: (value: SocialLinkPlatform) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          className='h-8 w-[152px] justify-between px-2'
          disabled={disabled}
        >
          <span className='flex items-center gap-2 truncate'>
            <SocialIcon platform={value} />
            <span>{SOCIAL_LINK_LABELS[value]}</span>
          </span>
          <ChevronsUpDown className='text-muted-foreground size-3.5' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[220px] p-0' align='start'>
        <Command>
          <CommandInput placeholder='Select platform...' />
          <CommandList>
            <CommandEmpty>No platforms available.</CommandEmpty>
            <CommandGroup>
              {SOCIAL_LINK_PLATFORMS.filter(
                platform =>
                  platform === value || !usedPlatforms.includes(platform),
              ).map(platform => (
                <CommandItem
                  key={platform}
                  value={SOCIAL_LINK_LABELS[platform]}
                  onSelect={() => {
                    onChange(platform);
                    setOpen(false);
                  }}
                >
                  <span className='flex items-center gap-2'>
                    <SocialIcon platform={platform} />
                    <span>{SOCIAL_LINK_LABELS[platform]}</span>
                  </span>
                  {platform === value ? (
                    <Check className='text-muted-foreground ml-auto size-3.5' />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function OrgSettingsPageClient({
  orgSlug,
}: OrgSettingsPageClientProps) {
  const user = useCachedQuery(api.users.currentUser);
  const org = useCachedQuery(
    api.organizations.queries.getBySlug,
    user?._id ? { orgSlug } : 'skip',
  );
  const members = useCachedQuery(
    api.organizations.queries.listMembersWithRoles,
    user?._id ? { orgSlug } : 'skip',
  );
  const views = useCachedQuery(
    api.views.queries.listViews,
    user?._id ? { orgSlug } : 'skip',
  );
  const documents = useCachedQuery(
    api.documents.queries.list,
    user?._id ? { orgSlug } : 'skip',
  );
  const updateOrganization = useMutation(
    api.organizations.mutations.update,
  ).withOptimisticUpdate((store, args) => {
    updateQuery(
      store,
      api.organizations.queries.getBySlug,
      { orgSlug: args.orgSlug },
      current => ({
        ...current,
        subtitle:
          args.data.subtitle !== undefined
            ? (args.data.subtitle ?? undefined)
            : current.subtitle,
        publicDescription:
          args.data.publicDescription !== undefined
            ? (args.data.publicDescription ?? undefined)
            : current.publicDescription,
        publicLandingViewId:
          args.data.publicLandingViewId !== undefined
            ? (args.data.publicLandingViewId ?? undefined)
            : current.publicLandingViewId,
        publicSocialLinks:
          args.data.publicSocialLinks !== undefined
            ? (args.data.publicSocialLinks ?? undefined)
            : current.publicSocialLinks,
        agentContext:
          args.data.agentContext !== undefined
            ? (args.data.agentContext ?? undefined)
            : current.agentContext,
        agentContextDocumentId:
          args.data.agentContextDocumentId !== undefined
            ? (args.data.agentContextDocumentId ?? undefined)
            : current.agentContextDocumentId,
      }),
    );

    updateQuery(
      store,
      api.organizations.queries.getPublicProfileBySlug,
      { orgSlug: args.orgSlug },
      current => ({
        ...current,
        subtitle:
          args.data.subtitle !== undefined
            ? (args.data.subtitle ?? null)
            : current.subtitle,
        publicDescription:
          args.data.publicDescription !== undefined
            ? (args.data.publicDescription ?? null)
            : current.publicDescription,
        publicLandingViewId:
          args.data.publicLandingViewId !== undefined
            ? (args.data.publicLandingViewId ?? null)
            : current.publicLandingViewId,
        publicSocialLinks:
          args.data.publicSocialLinks !== undefined
            ? (args.data.publicSocialLinks ?? [])
            : current.publicSocialLinks,
      }),
    );
  });

  const [subtitle, setSubtitle] = useState('');
  const [publicDescription, setPublicDescription] = useState('');
  const [publicLandingViewId, setPublicLandingViewId] =
    useState<Id<'views'> | null>(null);
  const [publicSocialLinks, setPublicSocialLinks] = useState<SocialLink[]>([]);
  const [hasPublicEdits, setHasPublicEdits] = useState(false);
  const [isSavingPublicSettings, setIsSavingPublicSettings] = useState(false);
  const [isSavingAgentDoc, setIsSavingAgentDoc] = useState(false);

  useEffect(() => {
    if (!org || hasPublicEdits) {
      return;
    }

    setSubtitle(org.subtitle ?? '');
    setPublicDescription(org.publicDescription ?? '');
    setPublicLandingViewId(org.publicLandingViewId ?? null);
    setPublicSocialLinks(org.publicSocialLinks ?? []);
  }, [org, hasPublicEdits]);

  const userRole = members?.find(member => member.userId === user?._id)?.role;
  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin' || isOwner;
  const publicViews = (views ?? [])
    .filter(view => view.visibility === 'public')
    .map(view => ({ _id: view._id, name: view.name }));

  const originalSubtitle = org?.subtitle ?? '';
  const originalDescription = org?.publicDescription ?? '';
  const originalLandingViewId = org?.publicLandingViewId ?? null;
  const originalSocialLinks = org?.publicSocialLinks ?? [];
  const publicSettingsDirty =
    subtitle !== originalSubtitle ||
    publicDescription !== originalDescription ||
    publicLandingViewId !== originalLandingViewId ||
    serializeSocialLinks(publicSocialLinks) !==
      serializeSocialLinks(originalSocialLinks);

  const header = (
    <div className='border-b'>
      <div className='flex items-center p-1 pl-9 lg:pl-1'>
        <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
          <Building className='size-3.5' />
          Organization
        </span>
      </div>
    </div>
  );

  const handleSavePublicSettings = async () => {
    setIsSavingPublicSettings(true);
    try {
      await updateOrganization({
        orgSlug,
        data: {
          subtitle,
          publicDescription,
          publicLandingViewId,
          publicSocialLinks,
        },
      });
      setHasPublicEdits(false);
      toast.success('Public site updated');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update public site',
      );
    } finally {
      setIsSavingPublicSettings(false);
    }
  };

  const handleAddSocialLink = () => {
    const nextPlatform = SOCIAL_LINK_PLATFORMS.find(
      platform => !publicSocialLinks.some(link => link.platform === platform),
    );

    if (!nextPlatform) {
      return;
    }

    setPublicSocialLinks(current => [
      ...current,
      { platform: nextPlatform, url: '' },
    ]);
    setHasPublicEdits(true);
  };

  if (org === undefined) {
    return (
      <div className='bg-background h-full'>
        {header}
        <div className='space-y-4 p-3'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-32' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-3 w-56' />
            </div>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-28' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-3 w-64' />
            </div>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-28' />
              <Skeleton className='size-16 rounded border' />
              <Skeleton className='h-3 w-56' />
            </div>
          </div>
          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='mt-2 h-3 w-80' />
            </div>
            <div className='space-y-4 p-3'>
              <Skeleton className='h-8 w-full' />
              <Skeleton className='h-28 w-full' />
              <Skeleton className='h-8 w-40' />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (org === null) {
    return (
      <div className='bg-background h-full'>
        {header}
        <div className='text-muted-foreground p-3 text-sm'>
          Organization not found
        </div>
      </div>
    );
  }

  return (
    <div className='bg-background h-full'>
      {header}

      <div className='space-y-4 p-3'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <label className='text-sm font-medium'>Organization Name</label>
            {isAdmin ? (
              <OrgNameEditor orgSlug={orgSlug} initialValue={org.name} />
            ) : (
              <div className='rounded-md border px-3 py-2 text-sm'>
                {org.name}
              </div>
            )}
            <p className='text-muted-foreground text-xs'>
              This is your organization&apos;s display name
            </p>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium'>Organization Slug</label>
            {isAdmin ? (
              <OrgSlugEditor orgSlug={orgSlug} initialValue={orgSlug} />
            ) : (
              <div className='bg-muted rounded-md px-3 py-2 font-mono text-sm'>
                {orgSlug}
              </div>
            )}
            <p className='text-muted-foreground text-xs'>
              Used in your organization&apos;s URL (example.com/{orgSlug})
            </p>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium'>Organization Logo</label>
            {isAdmin ? (
              <OrgLogoEditor orgSlug={orgSlug} initialValue={org.logo} />
            ) : org.logo ? (
              <Image
                src={`/api/files/${org.logo}`}
                alt='Org logo'
                width={64}
                height={64}
                className='size-16 rounded border object-cover'
              />
            ) : (
              <div className='bg-muted text-muted-foreground flex size-16 items-center justify-center rounded border text-sm'>
                No logo
              </div>
            )}
            <p className='text-muted-foreground text-xs'>
              Upload a square image (PNG, JPG, or SVG). Max 1MB.
            </p>
          </div>
        </div>

        <div className='rounded-md border'>
          <div className='border-b px-3 py-2'>
            <div className='text-sm font-medium'>Public site</div>
            <p className='text-muted-foreground mt-1 text-xs'>
              Configure what visitors see at{' '}
              <span className='font-mono'>/{orgSlug}</span> and in the public
              footer.
            </p>
          </div>

          <div className='space-y-4 p-3'>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>Subtitle</label>
              {isAdmin ? (
                <Input
                  value={subtitle}
                  onChange={event => {
                    setSubtitle(event.target.value);
                    setHasPublicEdits(true);
                  }}
                  placeholder='Shown below your organization name in the public footer'
                  className='h-8'
                  maxLength={120}
                />
              ) : subtitle ? (
                <div className='rounded-md border px-3 py-2 text-sm'>
                  {subtitle}
                </div>
              ) : (
                <div className='text-muted-foreground rounded-md border px-3 py-2 text-sm'>
                  No subtitle
                </div>
              )}
              <p className='text-muted-foreground text-xs'>
                Short line shown under your organization name on public pages.
              </p>
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>Landing view</label>
              {isAdmin ? (
                <PublicViewSelector
                  views={publicViews}
                  value={publicLandingViewId}
                  disabled={publicViews.length === 0}
                  onChange={value => {
                    setPublicLandingViewId(value);
                    setHasPublicEdits(true);
                  }}
                />
              ) : (
                <div className='rounded-md border px-3 py-2 text-sm'>
                  {publicViews.find(
                    view => view._id === org.publicLandingViewId,
                  )?.name ?? 'No public landing view'}
                </div>
              )}
              <p className='text-muted-foreground text-xs'>
                Choose a public saved view to render at{' '}
                <span className='font-mono'>/{orgSlug}</span>. If none is set,
                the route falls back to the normal workspace redirect.
              </p>
              {isAdmin && publicViews.length === 0 ? (
                <p className='text-muted-foreground text-xs'>
                  Create a public view first, then select it here.
                </p>
              ) : null}
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>
                Tagline / description
              </label>
              {isAdmin ? (
                <RichEditor
                  value={publicDescription}
                  onChange={value => {
                    setPublicDescription(value);
                    setHasPublicEdits(true);
                  }}
                  placeholder='Write a short public description for your workspace footer...'
                  className='min-h-[160px]'
                />
              ) : publicDescription ? (
                <div className='prose prose-sm dark:prose-invert max-w-none rounded-md border px-3 py-3'>
                  <Markdown>{publicDescription}</Markdown>
                </div>
              ) : (
                <div className='text-muted-foreground rounded-md border px-3 py-2 text-sm'>
                  No public description
                </div>
              )}
            </div>

            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <label className='text-sm font-medium'>Social links</label>
                {isAdmin ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-8'
                    disabled={
                      publicSocialLinks.length >= SOCIAL_LINK_PLATFORMS.length
                    }
                    onClick={handleAddSocialLink}
                  >
                    <Plus className='mr-1.5 size-3.5' />
                    Add link
                  </Button>
                ) : null}
              </div>

              {publicSocialLinks.length > 0 ? (
                <div className='space-y-2'>
                  {publicSocialLinks.map((link, index) => {
                    const usedPlatforms = publicSocialLinks
                      .map(item => item.platform)
                      .filter((_, usedIndex) => usedIndex !== index);

                    return (
                      <div
                        key={`${link.platform}-${index}`}
                        className='flex flex-col gap-2 sm:flex-row sm:items-center'
                      >
                        {isAdmin ? (
                          <>
                            <SocialPlatformSelector
                              value={link.platform}
                              disabled={false}
                              usedPlatforms={usedPlatforms}
                              onChange={platform => {
                                setPublicSocialLinks(current =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, platform }
                                      : item,
                                  ),
                                );
                                setHasPublicEdits(true);
                              }}
                            />
                            <Input
                              value={link.url}
                              onChange={event => {
                                setPublicSocialLinks(current =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, url: event.target.value }
                                      : item,
                                  ),
                                );
                                setHasPublicEdits(true);
                              }}
                              placeholder='https://example.com'
                              className='h-8 flex-1'
                            />
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              className='h-8 w-8 p-0'
                              onClick={() => {
                                setPublicSocialLinks(current =>
                                  current.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                );
                                setHasPublicEdits(true);
                              }}
                            >
                              <Trash2 className='size-3.5' />
                            </Button>
                          </>
                        ) : (
                          <div className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm'>
                            <SocialIcon platform={link.platform} />
                            <span className='min-w-0 flex-1 truncate'>
                              {link.url}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className='text-muted-foreground rounded-md border px-3 py-2 text-sm'>
                  No social links configured
                </div>
              )}

              <p className='text-muted-foreground text-xs'>
                These show up as icons in the public footer and open in a new
                tab.
              </p>
            </div>

            {isAdmin ? (
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  className='h-8'
                  disabled={isSavingPublicSettings || !publicSettingsDirty}
                  onClick={() => void handleSavePublicSettings()}
                >
                  Save public site
                </Button>
                {publicSettingsDirty ? (
                  <span className='text-muted-foreground text-xs'>
                    Unsaved changes
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {isAdmin ? (
          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <div className='text-sm font-medium'>
                Vector assistant context
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                Set a document as the organization context for the Vector
                assistant. The document content (and any documents it @mentions)
                will be included in the assistant&apos;s system prompt.
              </p>
            </div>

            <div className='space-y-4 p-3'>
              <div className='space-y-2'>
                <label className='text-sm font-medium'>Context document</label>
                <AgentContextDocumentSelector
                  documents={documents ?? []}
                  value={org.agentContextDocumentId ?? null}
                  disabled={isSavingAgentDoc}
                  onChange={async documentId => {
                    setIsSavingAgentDoc(true);
                    try {
                      await updateOrganization({
                        orgSlug,
                        data: {
                          agentContextDocumentId: documentId,
                        },
                      });
                      toast.success(
                        documentId
                          ? 'Context document set'
                          : 'Context document removed',
                      );
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : 'Failed to update context document',
                      );
                    } finally {
                      setIsSavingAgentDoc(false);
                    }
                  }}
                />
                <p className='text-muted-foreground text-xs'>
                  Create a document describing your org&apos;s domain, products,
                  tech stack, or workflows. Use @mentions to link other
                  documents — the assistant will follow those references too.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
