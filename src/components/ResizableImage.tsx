import { useRef, useState, type PointerEvent } from 'react';
import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { resizedWidth } from '../../shared/image-size';

function ImageView({ node, selected, updateAttributes, editor, getPos }: NodeViewProps) {
  const [preview, setPreview] = useState<number>();
  const drag = useRef<
    | {
        x: number;
        y: number;
        width: number;
        height: number;
        percent: number;
        sx: number;
        sy: number;
      }
    | undefined
  >(undefined);
  const width = preview ?? Number(node.attrs.width);
  const select = () => {
    const pos = getPos();
    if (pos !== undefined) editor.chain().focus().setNodeSelection(pos).run();
  };
  function start(event: PointerEvent<HTMLButtonElement>, sx: number, sy: number) {
    event.preventDefault();
    event.stopPropagation();
    select();
    const box = event.currentTarget.closest('.resizable-image')!.getBoundingClientRect();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      height: box.height,
      percent: width,
      sx,
      sy,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const d = drag.current;
    setPreview(
      resizedWidth(
        d.percent,
        d.width,
        d.height,
        (event.clientX - d.x) * d.sx,
        (event.clientY - d.y) * d.sy,
      ),
    );
  }
  return (
    <NodeViewWrapper
      className={`resizable-image ${selected ? 'is-selected' : ''}`}
      style={{ width: `${width}%` }}
      contentEditable={false}
    >
      <img
        src={window.mathcards.imageUrl?.(node.attrs.src) ?? node.attrs.src}
        alt={node.attrs.alt || 'Фотография конспекта'}
        onClick={select}
        data-drag-handle
      />
      {selected && editor.isEditable && (
        <>
          <span className="image-width-label">{Math.round(width * 10) / 10}%</span>
          {(
            [
              { name: 'Верхний левый', corner: 'nw', sx: -1, sy: -1 },
              { name: 'Верхний правый', corner: 'ne', sx: 1, sy: -1 },
              { name: 'Нижний левый', corner: 'sw', sx: -1, sy: 1 },
              { name: 'Нижний правый', corner: 'se', sx: 1, sy: 1 },
            ] as const
          ).map((h) => (
            <button
              key={h.corner}
              type="button"
              className={`resize-handle ${h.corner}`}
              role="slider"
              aria-label={`${h.name} угол изображения`}
              aria-valuemin={10}
              aria-valuemax={100}
              aria-valuenow={width}
              onPointerDown={(e) => start(e, h.sx, h.sy)}
              onPointerMove={move}
              onPointerUp={(e) => {
                if (!drag.current) return;
                move(e);
                const d = drag.current;
                updateAttributes({
                  width: resizedWidth(
                    d.percent,
                    d.width,
                    d.height,
                    (e.clientX - d.x) * d.sx,
                    (e.clientY - d.y) * d.sy,
                  ),
                });
                drag.current = undefined;
                setPreview(undefined);
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = undefined;
                setPreview(undefined);
              }}
              onKeyDown={(e) => {
                const delta = ['ArrowRight', 'ArrowUp'].includes(e.key)
                  ? 1
                  : ['ArrowLeft', 'ArrowDown'].includes(e.key)
                    ? -1
                    : 0;
                if (delta) {
                  e.preventDefault();
                  updateAttributes({
                    width: Math.min(100, Math.max(10, width + delta * (e.shiftKey ? 10 : 1))),
                  });
                }
              }}
            />
          ))}
        </>
      )}
    </NodeViewWrapper>
  );
}
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 100,
        parseHTML: () => 100,
        renderHTML: (attrs) => ({ style: `width:${Number(attrs.width)}%;height:auto` }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
