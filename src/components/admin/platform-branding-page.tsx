'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Palette, Upload, X, RefreshCw, Menu, Shield } from 'lucide-react';
import { useMutation, useQuery, api } from '@/lib/convex';
import { UserMenu } from '@/components/user-menu';
import { PlatformAdminSidebar } from './platform-admin-sidebar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const PLATFORM_ADMIN_ROLE = 'platform_admin';

const PRESET_COLORS = [
  '#111827',
  '#1e293b',
  '#0f172a',
  '#18181b',
  '#1c1917',
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#dc2626',
  '#d97706',
  '#0891b2',
  '#db2777',
];

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className='space-y-2'>
      <div className='text-xs font-medium'>{label}</div>
      <div className='flex items-center gap-2'>
        <div className='flex flex-wrap gap-1'>
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              onClick={() => onChange(color)}
              className='size-6 rounded-md border transition-transform hover:scale-110'
              style={{
                backgroundColor: color,
                outline: value === color ? '2px solid currentColor' : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
        </div>
        <Input
          type='text'
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder='#111827'
          className='h-8 w-24 font-mono text-xs'
        />
      </div>
    </div>
  );
}

function BrandingPageSkeleton() {
  return (
    <div className='bg-secondary flex h-screen'>
      <aside className='hidden w-56 lg:block'>
        <div className='flex h-full flex-col'>
          <div className='flex-1 overflow-y-auto'>
            <div className='space-y-4 p-2 pt-0'>
              <Skeleton className='h-8 w-full rounded-md' />
              <div className='space-y-2'>
                <Skeleton className='h-4 w-28' />
                <Skeleton className='h-8 w-full rounded-md' />
                <Skeleton className='h-8 w-full rounded-md' />
              </div>
            </div>
          </div>
          <div className='border-border border-t p-2'>
            <div className='flex items-center gap-2 p-2'>
              <Skeleton className='size-8 rounded-full' />
              <Skeleton className='h-4 w-28' />
            </div>
          </div>
        </div>
      </aside>
      <main className='bg-background m-2 ml-0 flex-1 overflow-y-auto rounded-md border'>
        <div className='border-b'>
          <div className='flex items-center p-1 pl-8 lg:pl-1'>
            <Skeleton className='h-5 w-32' />
          </div>
        </div>
        <div className='space-y-4 p-3'>
          <Skeleton className='h-7 w-48' />
          <Skeleton className='h-4 w-80' />
          <Skeleton className='h-40 w-full rounded-md' />
        </div>
      </main>
    </div>
  );
}

export function PlatformBrandingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const userQuery = useQuery(api.users.currentUser);
  const user = userQuery.data;
  const brandingQuery = useQuery(
    api.platformAdmin.queries.getBranding,
    user?.role === PLATFORM_ADMIN_ROLE ? {} : 'skip',
  );

  const updateBranding = useMutation(
    api.platformAdmin.mutations.updateBranding,
  );
  const generateUploadUrl = useMutation(
    api.platformAdmin.mutations.generateBrandLogoUploadUrl,
  );

  // Local form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [themeColor, setThemeColor] = useState('#111827');
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync server state to local
  useEffect(() => {
    if (!brandingQuery.data || hasLocalEdits) return;
    setName(brandingQuery.data.name);
    setDescription(brandingQuery.data.description);
    setThemeColor(brandingQuery.data.themeColor);
    setAccentColor(brandingQuery.data.accentColor);
  }, [brandingQuery.data, hasLocalEdits]);

  // Auth guard
  useEffect(() => {
    if (userQuery.isPending) return;
    if (user === null) {
      router.replace(`/auth/login?redirectTo=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user?.role !== PLATFORM_ADMIN_ROLE) {
      router.replace('/403');
    }
  }, [pathname, router, user, userQuery.isPending]);

  if (
    userQuery.isPending ||
    (user?.role === PLATFORM_ADMIN_ROLE && brandingQuery.isPending)
  ) {
    return <BrandingPageSkeleton />;
  }

  if (userQuery.isError || user?.role !== PLATFORM_ADMIN_ROLE) {
    return null;
  }

  if (!brandingQuery.data) {
    return <BrandingPageSkeleton />;
  }

  const branding = brandingQuery.data;

  const isDirty =
    name !== branding.name ||
    description !== branding.description ||
    themeColor !== branding.themeColor ||
    accentColor !== branding.accentColor;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateBranding({
        name,
        description,
        themeColor,
        accentColor,
      });
      setHasLocalEdits(false);
      toast.success('Branding updated');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save branding',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }

    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!response.ok) throw new Error('Upload failed');

      const { storageId } = await response.json();
      await updateBranding({ logoStorageId: storageId });
      toast.success('Logo uploaded');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to upload logo',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await updateBranding({ removeLogo: true });
      toast.success('Logo removed');
    } catch {
      toast.error('Failed to remove logo');
    }
  };

  return (
    <div className='bg-secondary flex h-screen'>
      <aside className='hidden w-56 lg:block'>
        <div className='flex h-full flex-col'>
          <div className='flex-1 overflow-y-auto'>
            <PlatformAdminSidebar />
          </div>
          <div className='border-border border-t p-2'>
            <UserMenu />
          </div>
        </div>
      </aside>

      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent
          side='left'
          showCloseButton={false}
          className='bg-secondary w-56 p-0 sm:max-w-56'
        >
          <SheetTitle className='sr-only'>Platform admin navigation</SheetTitle>
          <div className='flex h-full flex-col'>
            <div className='flex-1 overflow-y-auto'>
              <PlatformAdminSidebar />
            </div>
            <div className='border-border border-t p-2'>
              <UserMenu />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main className='bg-background relative m-2 ml-0 flex-1 overflow-y-auto rounded-md border'>
        <button
          onClick={() => setIsMobileOpen(true)}
          className='hover:bg-accent/80 absolute top-1.5 left-1.5 z-10 flex size-7 items-center justify-center rounded-md transition-colors lg:hidden'
          aria-label='Open platform admin menu'
        >
          <Menu className='text-muted-foreground size-4' />
        </button>

        <div className='border-b'>
          <div className='flex items-center p-1 pl-8 lg:pl-1'>
            <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
              <Shield className='size-3.5' />
              Platform Admin
            </span>
          </div>
        </div>

        <div className='space-y-4 p-3'>
          <div className='space-y-1'>
            <h1 className='text-lg font-semibold tracking-tight'>Branding</h1>
            <p className='text-muted-foreground text-sm'>
              Customize how this instance appears to all users. Changes apply
              globally across login pages, the manifest, and navigation.
            </p>
          </div>

          {/* Logo */}
          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <div className='text-sm font-medium'>Logo</div>
              <p className='text-muted-foreground mt-1 text-xs'>
                Square image recommended. Max 2MB. Shown on login pages and the
                web app manifest.
              </p>
            </div>

            <div className='flex items-center gap-4 p-3'>
              {branding.logoUrl ? (
                <div className='relative'>
                  <img
                    src={branding.logoUrl}
                    alt='Brand logo'
                    className='size-16 rounded-lg border object-contain'
                  />
                  <button
                    onClick={handleRemoveLogo}
                    className='bg-background hover:bg-destructive hover:text-destructive-foreground absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-sm transition-colors'
                  >
                    <X className='size-3' />
                  </button>
                </div>
              ) : (
                <div className='bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-lg border-2 border-dashed'>
                  <Palette className='size-6' />
                </div>
              )}

              <div>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/*'
                  className='hidden'
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleLogoUpload(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant='outline'
                  className='h-8'
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <RefreshCw className='mr-2 size-3.5 animate-spin' />
                  ) : (
                    <Upload className='mr-2 size-3.5' />
                  )}
                  {branding.logoUrl ? 'Replace' : 'Upload'} logo
                </Button>
              </div>
            </div>
          </div>

          {/* Name & Description */}
          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <div className='text-sm font-medium'>Name & description</div>
              <p className='text-muted-foreground mt-1 text-xs'>
                Shown in page titles, the PWA manifest, and auth pages.
              </p>
            </div>

            <div className='space-y-3 p-3'>
              <div className='space-y-2'>
                <div className='text-xs font-medium'>Platform name</div>
                <Input
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    setHasLocalEdits(true);
                  }}
                  placeholder='Vector'
                  className='h-8 max-w-sm'
                  maxLength={50}
                />
              </div>

              <div className='space-y-2'>
                <div className='text-xs font-medium'>Description</div>
                <Textarea
                  value={description}
                  onChange={e => {
                    setDescription(e.target.value);
                    setHasLocalEdits(true);
                  }}
                  placeholder='Project management platform'
                  className='max-w-lg resize-none text-sm'
                  rows={2}
                  maxLength={200}
                />
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <div className='text-sm font-medium'>Colors</div>
              <p className='text-muted-foreground mt-1 text-xs'>
                Theme color is used in the PWA manifest and browser chrome.
                Accent color is used for primary actions on auth pages.
              </p>
            </div>

            <div className='space-y-4 p-3'>
              <ColorPicker
                label='Theme color'
                value={themeColor}
                onChange={v => {
                  setThemeColor(v);
                  setHasLocalEdits(true);
                }}
              />
              <ColorPicker
                label='Accent color'
                value={accentColor}
                onChange={v => {
                  setAccentColor(v);
                  setHasLocalEdits(true);
                }}
              />
            </div>
          </div>

          {/* Preview */}
          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <div className='text-sm font-medium'>Preview</div>
            </div>

            <div className='flex items-center gap-4 p-4'>
              <div
                className='flex size-12 items-center justify-center rounded-xl text-lg font-bold text-white'
                style={{ backgroundColor: accentColor }}
              >
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt=''
                    className='size-full rounded-xl object-contain'
                  />
                ) : (
                  name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <div className='text-sm font-semibold'>{name || 'Vector'}</div>
                <div className='text-muted-foreground text-xs'>
                  {description || 'Project management platform'}
                </div>
              </div>
            </div>
          </div>

          {/* Save */}
          <div className='flex items-center gap-2'>
            <Button
              className='h-8'
              disabled={isSaving || !isDirty}
              onClick={handleSave}
            >
              {isSaving ? (
                <RefreshCw className='mr-2 size-3.5 animate-spin' />
              ) : null}
              Save branding
            </Button>
            {isDirty && (
              <span className='text-muted-foreground text-xs'>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
