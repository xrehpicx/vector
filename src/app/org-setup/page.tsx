import { OrgSetupForm } from '@/components/organization';

export default async function OrgSetupPage() {
  // This page is for first-time setup only. A check in a layout or middleware
  // would be more robust. Since we can't know the user's organizations without
  // authentication on the server, we'll rely on client-side redirects from
  // the main page to handle users who already have organizations.

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <div className='w-full max-w-sm space-y-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Create your organization
          </h1>
          <p className='text-muted-foreground text-sm'>
            Set up your workspace to get started
          </p>
        </div>

        <div className='rounded-lg border p-6'>
          <OrgSetupForm />
        </div>

        <p className='text-muted-foreground text-center text-xs'>
          You can invite team members and create projects after setup.
        </p>
      </div>
    </div>
  );
}
