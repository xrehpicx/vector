'use client';

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';
import { useTouchPrimary } from '@/hooks/use-has-primary-touch';

const ScrollAreaContext = React.createContext<boolean>(false);

type Mask = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    viewportClassName?: string;
    maskHeight?: number;
    maskClassName?: string;
    viewportRef?: React.ForwardedRef<HTMLDivElement>;
  }
>(
  (
    {
      className,
      children,
      scrollHideDelay = 0,
      viewportClassName,
      maskClassName,
      maskHeight = 30,
      viewportRef: externalViewportRef,
      ...props
    },
    ref,
  ) => {
    const [showMask, setShowMask] = React.useState<Mask>({
      top: false,
      bottom: false,
      left: false,
      right: false,
    });
    const internalViewportRef = React.useRef<HTMLDivElement>(null);
    const isTouch = useTouchPrimary();

    React.useImperativeHandle(
      externalViewportRef,
      () => internalViewportRef.current as HTMLDivElement,
    );

    const checkScrollability = React.useCallback(() => {
      const element = internalViewportRef.current;
      if (!element) return;

      const {
        scrollTop,
        scrollLeft,
        scrollWidth,
        clientWidth,
        scrollHeight,
        clientHeight,
      } = element;

      const computed = window.getComputedStyle(element);
      const overflowX = computed.overflowX;
      const horizontalHidden = overflowX === 'hidden' || overflowX === 'clip';

      setShowMask(prev => ({
        ...prev,
        top: scrollTop > 0,
        bottom: scrollTop + clientHeight < scrollHeight - 1,
        left: horizontalHidden ? false : scrollLeft > 0,
        right: horizontalHidden
          ? false
          : scrollLeft + clientWidth < scrollWidth - 1,
      }));
    }, []);

    React.useEffect(() => {
      if (typeof window === 'undefined') return;

      const element = internalViewportRef.current;
      if (!element) return;

      const controller = new AbortController();
      const { signal } = controller;

      const resizeObserver = new ResizeObserver(checkScrollability);
      resizeObserver.observe(element);

      element.addEventListener('scroll', checkScrollability, { signal });
      window.addEventListener('resize', checkScrollability, { signal });

      checkScrollability();

      return () => {
        controller.abort();
        resizeObserver.disconnect();
      };
    }, [checkScrollability, isTouch]);

    return (
      <ScrollAreaContext.Provider value={isTouch}>
        {isTouch ? (
          <div
            ref={ref}
            role='group'
            data-slot='scroll-area'
            aria-roledescription='scroll area'
            className={cn('relative overflow-hidden', className)}
            {...props}
          >
            <div
              ref={internalViewportRef}
              data-slot='scroll-area-viewport'
              className={cn(
                'size-full overflow-auto rounded-[inherit]',
                viewportClassName,
              )}
              tabIndex={0}
            >
              {children}
            </div>

            {maskHeight > 0 ? (
              <ScrollMask
                showMask={showMask}
                className={maskClassName}
                maskHeight={maskHeight}
              />
            ) : null}
          </div>
        ) : (
          <ScrollAreaPrimitive.Root
            ref={ref}
            data-slot='scroll-area'
            scrollHideDelay={scrollHideDelay}
            className={cn('relative overflow-hidden', className)}
            {...props}
          >
            <ScrollAreaPrimitive.Viewport
              ref={internalViewportRef}
              data-slot='scroll-area-viewport'
              className={cn('size-full rounded-[inherit]', viewportClassName)}
            >
              {children}
            </ScrollAreaPrimitive.Viewport>

            {maskHeight > 0 ? (
              <ScrollMask
                showMask={showMask}
                className={maskClassName}
                maskHeight={maskHeight}
              />
            ) : null}
            <ScrollBar orientation='vertical' />
            <ScrollBar orientation='horizontal' />
            <ScrollAreaPrimitive.Corner />
          </ScrollAreaPrimitive.Root>
        )}
      </ScrollAreaContext.Provider>
    );
  },
);

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => {
  const isTouch = React.useContext(ScrollAreaContext);

  if (isTouch) return null;

  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      data-slot='scroll-area-scrollbar'
      className={cn(
        'hover:bg-muted data-[state=visible]:fade-in-0 data-[state=hidden]:fade-out-0 data-[state=visible]:animate-in data-[state=hidden]:animate-out dark:hover:bg-muted/50 z-50 flex touch-none p-px transition-[colors] duration-150 select-none',
        orientation === 'vertical' &&
          'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' &&
          'h-2.5 flex-col border-t border-t-transparent px-1 pr-[5px]',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot='scroll-area-thumb'
        className={cn(
          'bg-border relative flex-1 origin-center rounded-full transition-[scale]',
          orientation === 'vertical' && 'my-1 active:scale-y-[0.95]',
          orientation === 'horizontal' && 'active:scale-x-[0.98]',
        )}
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
});

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

function ScrollMask({
  showMask,
  maskHeight,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  showMask: Mask;
  maskHeight: number;
}) {
  return (
    <>
      <div
        {...props}
        aria-hidden='true'
        style={
          {
            '--top-fade-height': showMask.top ? `${maskHeight}px` : '0px',
            '--bottom-fade-height': showMask.bottom ? `${maskHeight}px` : '0px',
          } as React.CSSProperties
        }
        className={cn(
          'pointer-events-none absolute inset-0 z-10',
          "before:absolute before:inset-x-0 before:top-0 before:transition-[height,opacity] before:duration-300 before:content-['']",
          "after:absolute after:inset-x-0 after:bottom-0 after:transition-[height,opacity] after:duration-300 after:content-['']",
          'before:h-(--top-fade-height) after:h-(--bottom-fade-height)',
          showMask.top ? 'before:opacity-100' : 'before:opacity-0',
          showMask.bottom ? 'after:opacity-100' : 'after:opacity-0',
          'before:from-background before:bg-gradient-to-b before:to-transparent',
          'after:from-background after:bg-gradient-to-t after:to-transparent',
          className,
        )}
      />
      <div
        {...props}
        aria-hidden='true'
        style={
          {
            '--left-fade-width': showMask.left ? `${maskHeight}px` : '0px',
            '--right-fade-width': showMask.right ? `${maskHeight}px` : '0px',
          } as React.CSSProperties
        }
        className={cn(
          'pointer-events-none absolute inset-0 z-10',
          "before:absolute before:inset-y-0 before:left-0 before:transition-[width,opacity] before:duration-300 before:content-['']",
          "after:absolute after:inset-y-0 after:right-0 after:transition-[width,opacity] after:duration-300 after:content-['']",
          'before:w-(--left-fade-width) after:w-(--right-fade-width)',
          showMask.left ? 'before:opacity-100' : 'before:opacity-0',
          showMask.right ? 'after:opacity-100' : 'after:opacity-0',
          'before:from-background before:bg-gradient-to-r before:to-transparent',
          'after:from-background after:bg-gradient-to-l after:to-transparent',
          className,
        )}
      />
    </>
  );
}

export { ScrollArea, ScrollBar };
