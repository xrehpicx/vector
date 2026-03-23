import { ImageResponse } from 'next/og';
import { getConvexClient } from '@/lib/convex-server';
import { api } from '@/convex/_generated/api';
import { OgCard } from '@/components/og/og-card';

export const runtime = 'nodejs';
export const alt = 'Issue preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface IssueData {
  key: string;
  title: string | null;
  orgName: string;
  orgSlug: string;
  state: { name: string; color?: string; type: string } | null;
  priority: { name: string; color?: string } | null;
  project: { name: string; key: string } | null;
}

function IssueOgImage({ data }: { data: IssueData }) {
  const stateColor = data.state?.color ?? '#6b7280';
  const priorityColor = data.priority?.color ?? '#6b7280';

  return (
    <OgCard orgName={data.orgName} entityType='Issue' entityKey={data.key}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: '#f9fafb',
            lineHeight: 1.2,
            display: 'flex',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {data.title}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {data.state && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: `${stateColor}22`,
                border: `1px solid ${stateColor}44`,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: stateColor,
                }}
              />
              <span style={{ fontSize: 20, color: '#d1d5db' }}>
                {data.state.name}
              </span>
            </div>
          )}
          {data.priority && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: `${priorityColor}22`,
                border: `1px solid ${priorityColor}44`,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: priorityColor,
                }}
              />
              <span style={{ fontSize: 20, color: '#d1d5db' }}>
                {data.priority.name}
              </span>
            </div>
          )}
          {data.project && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: '#ffffff11',
                border: '1px solid #ffffff22',
              }}
            >
              <span style={{ fontSize: 20, color: '#9ca3af' }}>
                {data.project.name}
              </span>
            </div>
          )}
        </div>
      </div>
    </OgCard>
  );
}

function PrivateIssueImage({ data }: { data: IssueData }) {
  return (
    <OgCard orgName={data.orgName} entityType='Issue' entityKey={data.key}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: 44, fontWeight: 700, color: '#f9fafb' }}>
          {data.key}
        </div>
        <div style={{ fontSize: 24, color: '#6b7280' }}>
          This issue is not public. Sign in to view it.
        </div>
      </div>
    </OgCard>
  );
}

function NotFoundImage({ orgSlug }: { orgSlug: string }) {
  return (
    <OgCard orgName={orgSlug} entityType='Issue' entityKey=''>
      <div style={{ fontSize: 44, fontWeight: 700, color: '#6b7280' }}>
        Issue not found
      </div>
    </OgCard>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ orgSlug: string; issueKey: string }>;
}) {
  const { orgSlug, issueKey } = await params;

  let data: IssueData | null = null;
  try {
    const client = getConvexClient();
    data = await client.query(api.og.queries.getPublicIssue, {
      orgSlug,
      issueKey,
    });
  } catch {
    // fall through to not-found
  }

  let content;
  if (data && data.title) {
    content = <IssueOgImage data={data} />;
  } else if (data) {
    content = <PrivateIssueImage data={data} />;
  } else {
    content = <NotFoundImage orgSlug={orgSlug} />;
  }

  return new ImageResponse(content, { ...size });
}
