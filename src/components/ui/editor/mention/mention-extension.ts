import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { buildMentionContent } from './mention-content';

const mentionSuggestionPluginKey = new PluginKey('mentionSuggestion');

export type MentionExtensionOptions = {
  suggestion: Partial<SuggestionOptions>;
};

const MentionExtension = Extension.create<MentionExtensionOptions>({
  name: 'entity-mention',

  addOptions() {
    return {
      suggestion: {} as Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: mentionSuggestionPluginKey,
        char: '@',
        allowSpaces: true,
        // Prevent re-triggering when the @ is inside an existing link (mention)
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          const linkMark = state.schema.marks.link;
          if (!linkMark) return true;
          // Check marks on the resolved position (works for middle of mark)
          if ($from.marks().some(m => m.type === linkMark)) return false;
          // Also check the text node at this position (handles inclusive:false boundaries)
          const nodeAfter = $from.nodeAfter;
          if (nodeAfter?.marks.some(m => m.type === linkMark)) return false;
          return true;
        },
        command: ({ editor, range, props }) => {
          const item = props as {
            id: string;
            label: string;
            type: 'user' | 'team' | 'project' | 'issue' | 'document';
            href: string;
            email?: string;
            icon?: string;
            color?: string;
          };

          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(buildMentionContent(item))
            .run();
        },
        ...this.options.suggestion,
      }),
    ];
  },
});

export default MentionExtension;
