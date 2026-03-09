import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { NotificationEventType } from './shared';

const h = React.createElement;

const colors = {
  bg: '#0a0a0a',
  panel: '#111111',
  text: '#f0f0f0',
  muted: '#888888',
  border: '#222222',
  accent: '#ffffff',
  accentBg: '#ffffff',
  metaBg: '#161616',
  metaBorder: '#1e1e1e',
};

const fontStack =
  'Urbanist, Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const bodyFontStack =
  'Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function formatInviteRoleLabel(role?: string) {
  switch (role) {
    case 'owner':
      return 'an owner';
    case 'admin':
      return 'an admin';
    case 'member':
    default:
      return 'a member';
  }
}

function capitalizeInviteRole(role?: string) {
  if (!role) {
    return 'Member';
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function metaRow(label: string, value: string, key: string) {
  return h(
    'tr',
    { key },
    h(
      'td',
      {
        style: {
          padding: '4px 0',
          fontSize: '12px',
          lineHeight: '16px',
          color: colors.muted,
          fontFamily: bodyFontStack,
          whiteSpace: 'nowrap' as const,
          verticalAlign: 'top',
          width: '1px',
          paddingRight: '12px',
        },
      },
      label,
    ),
    h(
      'td',
      {
        style: {
          padding: '4px 0',
          fontSize: '12px',
          lineHeight: '16px',
          color: colors.text,
          fontFamily: bodyFontStack,
        },
      },
      value,
    ),
  );
}

function vectorEmailLayout({
  preview,
  eyebrow,
  title,
  body,
  ctaHref,
  ctaLabel,
  meta,
}: {
  preview: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
  meta?: { label: string; value: string }[];
}) {
  return h(
    Html,
    null,
    h(Head),
    h(Preview, null, preview),
    h(
      Body,
      {
        style: {
          backgroundColor: colors.bg,
          fontFamily: bodyFontStack,
          color: colors.text,
          margin: 0,
          padding: '32px 0',
        },
      },
      h(
        Container,
        {
          style: {
            maxWidth: '520px',
            backgroundColor: colors.panel,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            overflow: 'hidden',
          },
        },
        // Header with Vector wordmark
        h(
          Section,
          {
            style: {
              padding: '20px 24px 0',
            },
          },
          h(
            Text,
            {
              style: {
                margin: 0,
                fontSize: '14px',
                fontWeight: 700,
                fontFamily: fontStack,
                color: colors.text,
                letterSpacing: '-0.02em',
              },
            },
            'Vector',
          ),
        ),
        // Eyebrow + Title + Body
        h(
          Section,
          { style: { padding: '16px 24px 0' } },
          h(
            Text,
            {
              style: {
                margin: 0,
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: colors.muted,
                fontWeight: 600,
                fontFamily: bodyFontStack,
              },
            },
            eyebrow,
          ),
          h(
            Heading,
            {
              as: 'h1',
              style: {
                margin: '8px 0 0',
                fontSize: '20px',
                lineHeight: '26px',
                fontWeight: 700,
                fontFamily: fontStack,
                color: colors.text,
                letterSpacing: '-0.01em',
              },
            },
            title,
          ),
          h(
            Text,
            {
              style: {
                margin: '8px 0 0',
                fontSize: '13px',
                lineHeight: '20px',
                color: colors.muted,
                fontFamily: bodyFontStack,
              },
            },
            body,
          ),
        ),
        // Meta table
        meta && meta.length > 0
          ? h(
              Section,
              {
                style: {
                  margin: '16px 24px 0',
                  padding: '12px 14px',
                  backgroundColor: colors.metaBg,
                  border: `1px solid ${colors.metaBorder}`,
                  borderRadius: '8px',
                },
              },
              h(
                'table',
                {
                  style: {
                    width: '100%',
                    borderCollapse: 'collapse' as const,
                  },
                },
                h(
                  'tbody',
                  null,
                  meta.map((item, index) =>
                    metaRow(item.label, item.value, `meta-${index}`),
                  ),
                ),
              ),
            )
          : null,
        // CTA button
        ctaHref && ctaLabel
          ? h(
              Section,
              { style: { padding: '20px 24px 0' } },
              h(
                Button,
                {
                  href: ctaHref,
                  style: {
                    backgroundColor: colors.accentBg,
                    color: '#000000',
                    fontSize: '13px',
                    fontWeight: 600,
                    fontFamily: bodyFontStack,
                    textDecoration: 'none',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    display: 'inline-block',
                  },
                },
                ctaLabel,
              ),
            )
          : null,
        // Footer
        h(Hr, {
          style: { borderColor: colors.border, margin: '24px 0 0' },
        }),
        h(
          Section,
          { style: { padding: '12px 24px 16px' } },
          h(
            Text,
            {
              style: {
                margin: 0,
                fontSize: '11px',
                lineHeight: '16px',
                color: colors.muted,
                fontFamily: bodyFontStack,
              },
            },
            'Sent by Vector — open the linked item to continue where the work is happening.',
          ),
        ),
      ),
    ),
  );
}

export function renderNotificationEmailTemplate({
  type,
  title,
  body,
  href,
  payload,
}: {
  type: NotificationEventType;
  title: string;
  body: string;
  href?: string;
  payload: {
    organizationName?: string;
    issueKey?: string;
    issueTitle?: string;
    commentPreview?: string;
    inviterName?: string;
    roleLabel?: string;
  };
}) {
  switch (type) {
    case 'organization_invite':
      return vectorEmailLayout({
        preview: `${payload.inviterName ?? 'Someone'} invited you to ${payload.organizationName ?? 'a workspace'} on Vector`,
        eyebrow: 'Workspace Invitation',
        title: `Join ${payload.organizationName ?? 'a workspace'}`,
        body: `${payload.inviterName ?? 'Someone'} invited you to collaborate as ${formatInviteRoleLabel(payload.roleLabel)}. Sign in or create an account with this email to get started.`,
        ctaHref: href,
        ctaLabel: 'Accept invitation',
        meta: [
          {
            label: 'Workspace',
            value: payload.organizationName ?? 'Unknown',
          },
          {
            label: 'Invited by',
            value: payload.inviterName ?? 'Unknown',
          },
          {
            label: 'Role',
            value: capitalizeInviteRole(payload.roleLabel),
          },
        ],
      });
    case 'issue_assigned':
    case 'issue_reassigned':
      return vectorEmailLayout({
        preview: title,
        eyebrow: type === 'issue_assigned' ? 'New Assignment' : 'Reassignment',
        title,
        body,
        ctaHref: href,
        ctaLabel: 'Open issue',
        meta: [
          { label: 'Issue', value: payload.issueKey ?? 'Unknown' },
          ...(payload.issueTitle
            ? [{ label: 'Title', value: payload.issueTitle }]
            : []),
        ],
      });
    case 'issue_mentioned':
      return vectorEmailLayout({
        preview: title,
        eyebrow: 'Mention',
        title,
        body,
        ctaHref: href,
        ctaLabel: 'View comment',
        meta: [
          { label: 'Issue', value: payload.issueKey ?? 'Unknown' },
          ...(payload.commentPreview
            ? [{ label: 'Comment', value: payload.commentPreview }]
            : []),
        ],
      });
    case 'issue_comment_on_assigned_issue':
      return vectorEmailLayout({
        preview: title,
        eyebrow: 'New Comment',
        title,
        body,
        ctaHref: href,
        ctaLabel: 'Open issue',
        meta: [
          { label: 'Issue', value: payload.issueKey ?? 'Unknown' },
          ...(payload.commentPreview
            ? [{ label: 'Comment', value: payload.commentPreview }]
            : []),
        ],
      });
  }
}
