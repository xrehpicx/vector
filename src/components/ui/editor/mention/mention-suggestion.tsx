import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import MentionListWrapper, {
  type MentionListWrapperHandle,
} from './mention-list-wrapper';
import type { SuggestionOptions as TiptapSuggestionOptions } from '@tiptap/suggestion';

export type MentionSuggestionOptions = {
  orgSlug: string;
  placement?: 'bottom-start' | 'top-start';
};

type MentionSuggestion = Pick<TiptapSuggestionOptions, 'items' | 'render'>;
type SuggestionRenderLifecycle = NonNullable<
  ReturnType<NonNullable<MentionSuggestion['render']>>
>;
type SuggestionKeyDownProps = Parameters<
  NonNullable<SuggestionRenderLifecycle['onKeyDown']>
>[0];

export function createMentionSuggestion(
  options: MentionSuggestionOptions,
): MentionSuggestion {
  const { orgSlug, placement = 'bottom-start' } = options;

  return {
    // Items is a no-op — the wrapper component fetches via useQuery
    items: ({ query }: { query: string }) => {
      return [query]; // pass query through as items prop
    },

    render: (): SuggestionRenderLifecycle => {
      let component: ReactRenderer<MentionListWrapperHandle> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: props => {
          component = new ReactRenderer(MentionListWrapper, {
            props: { ...props, orgSlug },
            editor: props.editor,
          });

          if (!props.clientRect) return;
          const referenceRect = () =>
            props.clientRect?.() ?? new DOMRect(0, 0, 0, 0);

          popup = tippy(document.body, {
            getReferenceClientRect: referenceRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement,
          });
        },

        onUpdate: props => {
          if (!component) return;
          component.updateProps({ ...props, orgSlug });
          if (!props.clientRect || !popup) return;
          const referenceRect = () =>
            props.clientRect?.() ?? new DOMRect(0, 0, 0, 0);
          popup.setProps({ getReferenceClientRect: referenceRect });
        },

        onKeyDown: ({ event }: SuggestionKeyDownProps): boolean => {
          if (event.key === 'Escape' && popup) {
            popup.hide();
            return true;
          }
          return component?.ref?.onKeyDown(event) ?? false;
        },

        onExit: (): void => {
          if (popup) popup.destroy();
          component?.destroy();
        },
      };
    },
  };
}
