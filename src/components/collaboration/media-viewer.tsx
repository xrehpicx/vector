'use client';

import Image from 'next/image';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { CollaborationAttachment } from './types';

interface MediaViewerProps {
  attachments: CollaborationAttachment[];
  activeIndex: number | null;
  onActiveIndexChange: (index: number) => void;
  onOpenChange: (open: boolean) => void;
}

export function MediaViewer({
  attachments,
  activeIndex,
  onActiveIndexChange,
  onOpenChange,
}: MediaViewerProps) {
  const reduceMotion = useReducedMotion();
  const open =
    activeIndex !== null &&
    activeIndex >= 0 &&
    activeIndex < attachments.length;
  const activeAttachment = open ? attachments[activeIndex] : null;
  const hasMultiple = attachments.length > 1;

  const showPrevious = () => {
    if (activeIndex === null) return;
    onActiveIndexChange(
      (activeIndex - 1 + attachments.length) % attachments.length,
    );
  };

  const showNext = () => {
    if (activeIndex === null) return;
    onActiveIndexChange((activeIndex + 1) % attachments.length);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className='!h-dvh !w-screen !max-w-none !translate-x-[-50%] !translate-y-[-50%] gap-0 overflow-hidden rounded-none border-0 bg-black/90 p-0 text-white ring-0 backdrop-blur-md'
        onClick={event => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}
        onKeyDown={event => {
          if (
            !hasMultiple ||
            (event.target instanceof HTMLElement &&
              event.target.closest('video, audio, input, textarea'))
          ) {
            return;
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            showPrevious();
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            showNext();
          }
        }}
      >
        <DialogTitle className='sr-only'>
          {activeAttachment?.name ?? 'Media preview'}
        </DialogTitle>
        <DialogDescription className='sr-only'>
          {hasMultiple
            ? 'Expanded media preview. Use the left and right arrow keys to move between attachments.'
            : 'Expanded media preview.'}
        </DialogDescription>

        <div className='pointer-events-none absolute inset-x-0 top-0 z-20 flex min-h-16 items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pt-[env(safe-area-inset-top)] sm:px-4'>
          <div className='min-w-0'>
            <p className='truncate text-xs font-medium text-white/90'>
              {activeAttachment?.name}
            </p>
            {hasMultiple && activeIndex !== null ? (
              <p
                className='mt-0.5 text-[10px] text-white/60 tabular-nums'
                aria-live='polite'
              >
                {activeIndex + 1} of {attachments.length}
              </p>
            ) : null}
          </div>

          <div className='pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-black/35 p-1 shadow-sm backdrop-blur-md'>
            {activeAttachment ? (
              <>
                <a
                  href={activeAttachment.url}
                  download={activeAttachment.name}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                    'size-11 text-white hover:bg-white/15 hover:text-white sm:size-8',
                  )}
                  aria-label={`Download ${activeAttachment.name}`}
                  title='Download'
                >
                  <Download className='size-3.5' aria-hidden='true' />
                </a>
                <a
                  href={activeAttachment.url}
                  target='_blank'
                  rel='noreferrer'
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                    'size-11 text-white hover:bg-white/15 hover:text-white sm:size-8',
                  )}
                  aria-label={`Open ${activeAttachment.name} in a new tab`}
                  title='Open original'
                >
                  <ExternalLink className='size-3.5' aria-hidden='true' />
                </a>
              </>
            ) : null}
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              className='size-11 text-white hover:bg-white/15 hover:text-white sm:size-8'
              onClick={() => onOpenChange(false)}
              aria-label='Close media preview'
              title='Close'
            >
              <X className='size-4' aria-hidden='true' />
            </Button>
          </div>
        </div>

        {hasMultiple ? (
          <>
            <Button
              type='button'
              variant='ghost'
              size='icon-lg'
              className='absolute top-1/2 left-2 z-20 size-11 -translate-y-1/2 rounded-full border border-white/10 bg-black/45 text-white shadow-sm backdrop-blur-md hover:bg-white/15 hover:text-white sm:left-3'
              onClick={showPrevious}
              aria-label='Previous attachment'
            >
              <ChevronLeft className='size-5' aria-hidden='true' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-lg'
              className='absolute top-1/2 right-2 z-20 size-11 -translate-y-1/2 rounded-full border border-white/10 bg-black/45 text-white shadow-sm backdrop-blur-md hover:bg-white/15 hover:text-white sm:right-3'
              onClick={showNext}
              aria-label='Next attachment'
            >
              <ChevronRight className='size-5' aria-hidden='true' />
            </Button>
          </>
        ) : null}

        <div
          className='flex size-full min-h-0 min-w-0 items-center justify-center px-3 pt-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-14 sm:py-16'
          onClick={() => onOpenChange(false)}
        >
          <AnimatePresence mode='wait' initial={false}>
            {activeAttachment ? (
              <motion.div
                key={activeAttachment.id}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.965, y: 6 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.98, y: -4 }
                }
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className='relative flex size-full min-h-0 min-w-0 items-center justify-center'
              >
                {activeAttachment.kind === 'image' ? (
                  <Image
                    src={activeAttachment.url}
                    alt={activeAttachment.name}
                    fill
                    sizes='100vw'
                    unoptimized
                    priority
                    className='object-contain drop-shadow-2xl'
                    onClick={event => {
                      const image = event.currentTarget;
                      if (
                        image.naturalWidth === 0 ||
                        image.naturalHeight === 0
                      ) {
                        event.stopPropagation();
                        return;
                      }

                      const bounds = image.getBoundingClientRect();
                      const imageRatio =
                        image.naturalWidth / image.naturalHeight;
                      const boundsRatio = bounds.width / bounds.height;
                      const renderedWidth =
                        imageRatio > boundsRatio
                          ? bounds.width
                          : bounds.height * imageRatio;
                      const renderedHeight =
                        imageRatio > boundsRatio
                          ? bounds.width / imageRatio
                          : bounds.height;
                      const renderedLeft =
                        bounds.left + (bounds.width - renderedWidth) / 2;
                      const renderedTop =
                        bounds.top + (bounds.height - renderedHeight) / 2;
                      const isOnImage =
                        event.clientX >= renderedLeft &&
                        event.clientX <= renderedLeft + renderedWidth &&
                        event.clientY >= renderedTop &&
                        event.clientY <= renderedTop + renderedHeight;

                      if (isOnImage) event.stopPropagation();
                    }}
                  />
                ) : (
                  <video
                    key={activeAttachment.url}
                    src={activeAttachment.url}
                    controls
                    preload='metadata'
                    playsInline
                    aria-label={`Video: ${activeAttachment.name}`}
                    style={
                      activeAttachment.width && activeAttachment.height
                        ? {
                            aspectRatio: `${activeAttachment.width} / ${activeAttachment.height}`,
                          }
                        : undefined
                    }
                    className='block h-auto max-h-[calc(100dvh-6.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-auto max-w-[calc(100vw-1.5rem)] rounded-md bg-black object-contain shadow-2xl sm:max-h-[calc(100dvh-8rem)] sm:max-w-[min(72rem,calc(100vw-7rem))]'
                    onClick={event => event.stopPropagation()}
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
