'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

const MIN_WIDTH = 80;

export function ResizableImageView({
  node,
  updateAttributes,
  selected,
  editor,
}: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const handleSideRef = useRef<'left' | 'right'>('right');

  const { src, alt, title, width, uploading, uploadError } = node.attrs as {
    src?: string;
    alt?: string;
    title?: string;
    width?: number | null;
    uploading?: boolean;
    uploadError?: string | null;
    uploadId?: string | null;
  };

  const isEditable = editor.isEditable;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent, side: 'left' | 'right') => {
      if (!isEditable) return;
      event.preventDefault();
      event.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      const imgEl = container.querySelector('img');
      if (!imgEl) return;

      startXRef.current = event.clientX;
      startWidthRef.current = imgEl.getBoundingClientRect().width;
      handleSideRef.current = side;
      setResizing(true);
    },
    [isEditable],
  );

  useEffect(() => {
    if (!resizing) return;

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const delta =
        handleSideRef.current === 'right'
          ? event.clientX - startXRef.current
          : startXRef.current - event.clientX;

      const nextWidth = Math.max(MIN_WIDTH, startWidthRef.current + delta);
      const container = containerRef.current;
      if (!container) return;

      // Clamp to parent width
      const parentWidth =
        container.closest('.tiptap')?.getBoundingClientRect().width ?? Infinity;
      const clamped = Math.min(nextWidth, parentWidth);

      const img = container.querySelector('img');
      if (img) {
        img.style.width = `${clamped}px`;
      }
    };

    const onPointerUp = (_event: globalThis.PointerEvent) => {
      setResizing(false);
      const container = containerRef.current;
      if (!container) return;
      const img = container.querySelector('img');
      if (img) {
        const finalWidth = Math.round(
          parseFloat(img.style.width) || img.getBoundingClientRect().width,
        );
        updateAttributes({ width: finalWidth });
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [resizing, updateAttributes]);

  const imgStyle: React.CSSProperties = {
    ...(width ? { width: `${width}px` } : {}),
    maxWidth: '100%',
    height: 'auto',
  };

  return (
    <NodeViewWrapper
      as='div'
      className='resizable-image-wrapper'
      data-drag-handle=''
    >
      <div
        ref={containerRef}
        className={`resizable-image-container${selected ? 'selected' : ''}${resizing ? 'resizing' : ''}`}
        style={{
          display: 'inline-block',
          position: 'relative',
          maxWidth: '100%',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ''}
          title={title ?? undefined}
          style={imgStyle}
          draggable={false}
          data-uploading={uploading ? 'true' : undefined}
          data-upload-error={uploadError ?? undefined}
        />
        {isEditable && (selected || resizing) ? (
          <>
            <div
              className='resize-handle resize-handle-left'
              onPointerDown={e => onPointerDown(e, 'left')}
            />
            <div
              className='resize-handle resize-handle-right'
              onPointerDown={e => onPointerDown(e, 'right')}
            />
          </>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
