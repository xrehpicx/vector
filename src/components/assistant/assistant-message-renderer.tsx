'use client';

import { type UIMessage, useSmoothText } from '@convex-dev/agent/react';
import { useDeferredValue, useMemo } from 'react';
import { motion } from 'motion/react';
import { BarsSpinner } from '@/components/bars-spinner';
import { Brain } from 'lucide-react';
import { AssistantToolRenderer } from './assistant-tool-renderers';
import { AssistantResponse } from './assistant-response';

type MessagePart = UIMessage['parts'][number];

function getMessageKey(message: UIMessage) {
  return String(
    (message as { key?: string }).key ??
      message.id ??
      `${message.role}-${message.order}-${message.stepOrder}`,
  );
}

function getTextParts(parts: ReadonlyArray<MessagePart>) {
  return parts.filter(
    (part): part is Extract<MessagePart, { type: 'text' }> =>
      part.type === 'text',
  );
}

function getCombinedText(parts: ReadonlyArray<MessagePart>) {
  return getTextParts(parts)
    .map(part => part.text ?? '')
    .join('');
}

function getToolName(part: MessagePart) {
  if (
    'toolName' in part &&
    typeof part.toolName === 'string' &&
    part.toolName.length > 0
  ) {
    return part.toolName;
  }

  if (part.type.startsWith('tool-')) {
    return part.type.slice(5);
  }

  return null;
}

function getPreviewText(message: UIMessage) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const fragments: string[] = [];

  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      fragments.push(part.text);
      continue;
    }

    if (part.type === 'reasoning' && typeof part.text === 'string') {
      fragments.push(part.text);
      continue;
    }

    const toolName = getToolName(part);
    if (toolName) {
      fragments.push(`[${toolName}]`);
    }
  }

  const text = fragments.join(' ').replace(/\s+/g, ' ').trim();
  return text || (message.role === 'assistant' ? 'Working through tools.' : '');
}

function isToolPart(part: MessagePart) {
  return (
    part.type.startsWith('tool-') ||
    part.type === 'tool-call' ||
    part.type === 'tool-invocation'
  );
}

function normalizeToolParts(parts: ReadonlyArray<MessagePart>) {
  const toolBestById = new Map<
    string,
    { index: number; part: MessagePart; isResult: boolean }
  >();

  const isToolResult = (part: MessagePart) => {
    const candidate = part as {
      state?: string;
      output?: unknown;
      result?: unknown;
    };
    return (
      candidate.state === 'output-available' ||
      candidate.state === 'output-error' ||
      candidate.state === 'result' ||
      candidate.output != null ||
      candidate.result != null
    );
  };

  parts.forEach((part, index) => {
    if (!isToolPart(part)) return;
    const toolCallId =
      ('toolCallId' in part && typeof part.toolCallId === 'string'
        ? part.toolCallId
        : null) ??
      ('id' in part && typeof part.id === 'string' ? part.id : null);
    if (!toolCallId) return;

    const candidateIsResult = isToolResult(part);
    const existing = toolBestById.get(toolCallId);

    if (
      !existing ||
      (!existing.isResult && candidateIsResult) ||
      (existing.isResult === candidateIsResult && index > existing.index)
    ) {
      toolBestById.set(toolCallId, {
        index,
        part,
        isResult: candidateIsResult,
      });
    }
  });

  return parts.filter((part, index) => {
    if (!isToolPart(part)) return true;
    const toolCallId =
      ('toolCallId' in part && typeof part.toolCallId === 'string'
        ? part.toolCallId
        : null) ??
      ('id' in part && typeof part.id === 'string' ? part.id : null);
    if (!toolCallId) return true;
    return toolBestById.get(toolCallId)?.index === index;
  });
}

function PreviewMessage({ message }: { message: UIMessage }) {
  const text = getPreviewText(message);
  if (!text) return null;

  if (message.role === 'user') {
    return (
      <div className='px-2 py-1'>
        <div className='bg-muted text-foreground ml-auto max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-4'>
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className='text-muted-foreground px-2 py-1 text-[11px] leading-4'>
      {text}
    </div>
  );
}

function UserMessage({ message }: { message: UIMessage }) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text = getCombinedText(parts).trim();

  return (
    <motion.div
      layout='position'
      initial={{ opacity: 0, y: 4, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className='sticky top-0 z-10 mt-4 ml-auto w-fit max-w-[85%]'
    >
      <div className='bg-muted text-foreground inline-block w-fit rounded-3xl px-4 py-2'>
        <div className='text-sm break-words whitespace-pre-wrap'>{text}</div>
      </div>
    </motion.div>
  );
}

function ReasoningSection({
  text,
  isStreaming,
}: {
  text?: string;
  isStreaming: boolean;
}) {
  if (isStreaming) {
    return (
      <div className='text-muted-foreground/60 flex items-center gap-1.5 py-0.5 text-[11px]'>
        <BarsSpinner size={10} />
        <span>thinking</span>
      </div>
    );
  }

  if (!text?.trim()) return null;

  return (
    <details className='group py-0.5'>
      <summary className='text-muted-foreground/50 hover:text-muted-foreground/70 flex cursor-pointer list-none items-center gap-1.5 text-[11px]'>
        <Brain className='size-3' />
        <span>thought process</span>
      </summary>
      <div className='text-muted-foreground/60 mt-1 pl-[18px] text-[11px] leading-4 whitespace-pre-wrap'>
        {text.trim()}
      </div>
    </details>
  );
}

function AssistantMessage({ message }: { message: UIMessage }) {
  const rawParts = Array.isArray(message.parts) ? message.parts : [];
  const parts = useMemo(() => normalizeToolParts(rawParts), [rawParts]);
  const messageText = getCombinedText(rawParts);
  const [visibleText] = useSmoothText(messageText, {
    startStreaming: message.status === 'streaming',
  });
  const deferredVisibleText = useDeferredValue(visibleText);
  const textParts = getTextParts(rawParts);

  const getTextForPart = (part: Extract<MessagePart, { type: 'text' }>) => {
    if (message.status !== 'streaming') {
      return part.text ?? '';
    }

    const currentTextPartIndex = textParts.findIndex(
      candidate => candidate === part,
    );
    if (currentTextPartIndex === -1) return part.text ?? '';

    let offset = 0;
    for (let index = 0; index < currentTextPartIndex; index += 1) {
      offset += textParts[index]?.text?.length ?? 0;
    }

    return deferredVisibleText.slice(offset, offset + (part.text?.length ?? 0));
  };

  const hasVisibleContent =
    deferredVisibleText.trim().length > 0 ||
    parts.some(part => part.type === 'reasoning' || isToolPart(part));

  return (
    <div className='px-1 py-1'>
      {!hasVisibleContent && message.status === 'streaming' ? (
        <ReasoningSection isStreaming text='' />
      ) : (
        <div className='space-y-2'>
          {parts.map((part, index) => {
            if (part.type === 'text') {
              const partText = getTextForPart(part);
              if (!partText) return null;
              return (
                <div
                  key={`text-${getMessageKey(message)}-${index}`}
                  className='overflow-hidden'
                >
                  <AssistantResponse
                    parseIncompleteMarkdown={message.status === 'streaming'}
                  >
                    {partText}
                  </AssistantResponse>
                </div>
              );
            }

            if (part.type === 'reasoning') {
              return (
                <ReasoningSection
                  key={`reasoning-${getMessageKey(message)}-${index}`}
                  text={part.text}
                  isStreaming={part.state !== 'done'}
                />
              );
            }

            if (isToolPart(part)) {
              return (
                <AssistantToolRenderer
                  key={`tool-${getMessageKey(message)}-${index}`}
                  tool={part as never}
                />
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}

export function AssistantDockMessage({
  message,
  compact = false,
}: {
  message: UIMessage;
  compact?: boolean;
}) {
  if (compact) {
    return <PreviewMessage message={message} />;
  }

  if (message.role === 'user') {
    return <UserMessage message={message} />;
  }

  return <AssistantMessage message={message} />;
}
