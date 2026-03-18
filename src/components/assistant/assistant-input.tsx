'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { cn } from '@/lib/utils';
import MentionExtension from '@/components/ui/editor/mention/mention-extension';
import { createMentionSuggestion } from '@/components/ui/editor/mention/mention-suggestion';
import { detectMentionType } from '@/components/ui/editor/mention/mention-config';
import type { MentionTypeId } from '@/components/ui/editor/mention/mention-config';
import { getAvatarDataUri } from '@/components/ui/editor/mention/avatar-svg';
import { getLucideIconDataUri } from '@/components/ui/editor/mention/icon-svg';
import { buildMentionContent } from '@/components/ui/editor/mention/mention-content';

export type MentionRef = {
  type: MentionTypeId;
  id: string;
  label: string;
  href: string;
};

export type AssistantInputHandle = {
  submit: () => Promise<void>;
  focus: () => void;
  insertIssueMention: (issue: AssistantInputIssueMention) => void;
};

export type AssistantInputIssueMention = {
  label: string;
  href: string;
  icon?: string | null;
  color?: string | null;
};

export type AssistantInputProps = {
  orgSlug: string;
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (
    text: string,
    mentions: MentionRef[],
  ) => Promise<boolean> | boolean;
  onFocus?: () => void;
  className?: string;
};

/**
 * Extract plain-text prompt and mention references from editor content.
 */
function extractPromptAndMentions(
  editor: NonNullable<ReturnType<typeof useEditor>>,
): {
  text: string;
  bodyText: string;
  mentions: MentionRef[];
} {
  const mentions: MentionRef[] = [];
  const seenMentionKeys = new Set<string>();
  const bodyTextParts: string[] = [];

  editor.state.doc.descendants((node: ProseMirrorNode) => {
    if (!node.isText) return;

    const mentionMarks = node.marks.filter(mark => {
      if (mark.type.name !== 'link') return false;
      const href = mark.attrs.href as string | undefined;
      return Boolean(href && detectMentionType(href));
    });

    if (mentionMarks.length === 0 && node.text) {
      bodyTextParts.push(node.text);
    }

    for (const mark of node.marks) {
      if (mark.type.name !== 'link') continue;
      const href = mark.attrs.href as string | undefined;
      if (!href) continue;
      const mentionType = detectMentionType(href);
      if (!mentionType) continue;

      const cleanHref = href.split('#')[0];
      const segments = cleanHref.split('/').filter(Boolean);
      const id = segments[segments.length - 1] ?? '';
      const mentionKey = `${mentionType.id}:${id}`;
      if (id && !seenMentionKeys.has(mentionKey)) {
        seenMentionKeys.add(mentionKey);
        mentions.push({
          type: mentionType.id,
          id,
          label: node.text ?? '',
          href: cleanHref,
        });
      }
    }
  });

  const text = editor.state.doc.textContent;
  return { text, bodyText: bodyTextParts.join(''), mentions };
}

/**
 * TipTap extension that submits on Enter (without Shift).
 * This runs AFTER the suggestion plugin, so Enter to select a mention
 * is handled first and won't trigger submit.
 */
function createSubmitOnEnterExtension(getOnSubmit: () => (() => void) | null) {
  return Extension.create({
    name: 'submitOnEnter',
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          getOnSubmit()?.();
          return true;
        },
      };
    },
  });
}

export const AssistantInput = forwardRef<
  AssistantInputHandle,
  AssistantInputProps
>(function AssistantInput(
  {
    orgSlug,
    placeholder = 'Ask anything or tell me what to do...',
    disabled = false,
    onSubmit,
    onFocus,
    className,
  },
  ref,
) {
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const handleSubmit = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const { text, bodyText, mentions } = extractPromptAndMentions(editor);
    if (!bodyText.trim()) return;
    const previousContent = editor.getJSON();
    editor.commands.clearContent();
    const shouldClear = await onSubmitRef.current(text, mentions);
    if (shouldClear === false) {
      editor.commands.setContent(previousContent);
      editor.commands.focus('end');
    }
  }, []);

  // Stable getter for the submit function
  const getSubmitFn = useCallback(
    () => () => {
      void handleSubmit();
    },
    [handleSubmit],
  );

  const insertIssueMention = useCallback(
    (issue: AssistantInputIssueMention) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor
        .chain()
        .focus('end')
        .insertContent(
          buildMentionContent({
            type: 'issue',
            label: issue.label,
            href: issue.href,
            icon: issue.icon,
            color: issue.color,
          }),
        )
        .run();
    },
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        link: false,
        underline: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
      }),
      Link.extend({
        renderHTML({ HTMLAttributes }) {
          const href = HTMLAttributes.href as string | undefined;
          if (!href) return ['a', HTMLAttributes, 0];

          const mentionType = detectMentionType(href);
          if (!mentionType) return ['a', HTMLAttributes, 0];

          const mentionClass = `mention-chip ${mentionType.cssClass}`;
          const hashIdx = href.indexOf('#');
          const hashParams =
            hashIdx >= 0 ? new URLSearchParams(href.slice(hashIdx + 1)) : null;

          let style: string | undefined;
          if (mentionType.hashEncoding === 'email') {
            const email = hashParams?.get('email');
            if (email) {
              const avatarUri = getAvatarDataUri(email);
              style = `--mention-icon: url('${avatarUri}')`;
            }
          } else if (mentionType.hashEncoding === 'icon') {
            const iconName = hashParams?.get('icon');
            const iconColor = hashParams?.get('color');
            if (iconName) {
              const iconUri = getLucideIconDataUri(
                iconName,
                iconColor || undefined,
              );
              if (iconUri) style = `--mention-icon: url('${iconUri}')`;
            }
          }

          const attrs: Record<string, string> = {
            ...HTMLAttributes,
            class: mentionClass,
          };
          if (style) attrs.style = style;
          return ['a', attrs, 0];
        },
      }).configure({
        openOnClick: false,
        enableClickSelection: true,
        HTMLAttributes: { rel: null, target: null },
      }),
      Placeholder.configure({
        placeholder: ({ node }: { node: ProseMirrorNode }): string =>
          node.type.name === 'paragraph' ? placeholder : '',
        showOnlyCurrent: true,
        includeChildren: true,
      }),
      MentionExtension.configure({
        suggestion: createMentionSuggestion({
          orgSlug,
          placement: 'top-start',
        }),
      }),
      createSubmitOnEnterExtension(getSubmitFn),
    ],
    editorProps: {
      attributes: {
        class: cn(
          'assistant-input-editor outline-none text-sm max-h-40 overflow-y-auto',
          '[&_p.is-empty::before]:text-muted-foreground [&_p.is-empty::before]:content-[attr(data-placeholder)] [&_p.is-empty::before]:pointer-events-none [&_p.is-empty::before]:float-left [&_p.is-empty::before]:h-0',
          '[&_p]:my-0',
        ),
      },
    },
    editable: !disabled,
    immediatelyRender: false,
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
  });

  useEffect(() => {
    if (editor) editorRef.current = editor;
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      submit: handleSubmit,
      focus: () => editor?.commands.focus(),
      insertIssueMention,
    }),
    [handleSubmit, insertIssueMention, editor],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  return (
    <div
      className={cn('px-3 py-2', className)}
      onClick={() => editor.commands.focus()}
      onFocus={onFocus}
    >
      <EditorContent editor={editor} />
    </div>
  );
});
