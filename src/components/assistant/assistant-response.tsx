'use client';

import { cn } from '@/lib/utils';
import { memo, type ComponentProps } from 'react';
import { Streamdown } from 'streamdown';

type AssistantResponseProps = ComponentProps<typeof Streamdown>;

function improveMarkdownTypography(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  const nextNonEmptyIndex = (from: number) => {
    for (let index = from; index < lines.length; index += 1) {
      if (lines[index]?.trim()) return index;
    }
    return null;
  };

  const isHeading = (line: string) => /^#{1,6}\s+/.test(line.trim());
  const isListLine = (line: string) =>
    /^(\s*[-*+]\s+|\s*\d+[\.\)]\s+)/.test(line);

  const looksLikeSectionLabel = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (isHeading(trimmed) || isListLine(trimmed)) return false;
    if (trimmed.startsWith('```') || trimmed.startsWith('>')) return false;
    if (trimmed.length > 64) return false;
    if (/[.!?;]/.test(trimmed) || trimmed.endsWith(':')) return false;
    return trimmed.split(/\s+/).filter(Boolean).length <= 8;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (!looksLikeSectionLabel(trimmed)) continue;

    const nextIndex = nextNonEmptyIndex(index + 1);
    if (nextIndex === null) continue;

    if (isListLine(lines[nextIndex] ?? '')) {
      lines[index] = `### ${trimmed}`;
    }
  }

  return lines.join('\n');
}

export const AssistantResponse = memo(
  ({
    className,
    children,
    parseIncompleteMarkdown,
    ...props
  }: AssistantResponseProps) => {
    const improvedChildren =
      typeof children === 'string' && !parseIncompleteMarkdown
        ? improveMarkdownTypography(children)
        : children;

    return (
      <Streamdown
        className={cn(
          'prose prose-sm max-w-none',
          'prose-p:my-2 prose-p:leading-6',
          'prose-ul:my-2 prose-ol:my-2 prose-ul:pl-5 prose-ol:pl-5',
          'prose-li:my-0.5 prose-li:leading-6',
          'prose-headings:mt-4 prose-headings:mb-2 prose-headings:leading-tight',
          'prose-h1:text-base prose-h1:font-semibold',
          'prose-h2:text-sm prose-h2:font-semibold',
          'prose-h3:text-sm prose-h3:font-medium',
          'prose-a:text-foreground prose-a:underline prose-a:underline-offset-4',
          'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em]',
          'prose-code:before:content-none prose-code:after:content-none',
          'prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:border prose-pre:border-border prose-pre:bg-muted/45 prose-pre:px-3 prose-pre:py-2 prose-pre:text-foreground prose-pre:shadow-none',
          'prose-table:my-2 prose-table:w-full prose-table:border-collapse',
          'prose-th:border prose-th:border-border prose-th:bg-muted/40 prose-th:px-2 prose-th:py-1 prose-th:text-left',
          'prose-td:border prose-td:border-border prose-td:px-2 prose-td:py-1',
          'prose-blockquote:my-2 prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:text-muted-foreground',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          className,
        )}
        parseIncompleteMarkdown={parseIncompleteMarkdown}
        {...props}
      >
        {improvedChildren}
      </Streamdown>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

AssistantResponse.displayName = 'AssistantResponse';
