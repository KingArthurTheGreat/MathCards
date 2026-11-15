import { createElement, useState, type ReactNode } from 'react';
import katex from 'katex';
import type { Doc, RichNode } from '../../shared/model';
import { Modal } from './Modal';
export function Formula({ latex, block = false }: { latex: string; block?: boolean }) {
  let html: string;
  try {
    html = katex.renderToString(latex, {
      displayMode: block,
      throwOnError: false,
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
      strict: 'ignore',
    });
  } catch {
    html = 'Ошибка формулы';
  }
  return (
    <span
      className={block ? 'formula block' : 'formula'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
export function Content({ doc }: { doc: Doc }) {
  const [zoom, setZoom] = useState<string>();
  function render(n: RichNode, key: number): ReactNode {
    const children = n.content?.map(render);
    if (n.type === 'text') {
      let t: ReactNode = n.text;
      for (const mark of n.marks ?? [])
        t = createElement(
          (
            { bold: 'strong', italic: 'em', strike: 's', code: 'code', underline: 'u' } as Record<
              string,
              string
            >
          )[mark.type] ?? 'span',
          {},
          t,
        );
      return <span key={key}>{t}</span>;
    }
    if (n.type === 'inlineMath' || n.type === 'blockMath')
      return (
        <Formula key={key} latex={String(n.attrs?.latex ?? '')} block={n.type === 'blockMath'} />
      );
    if (n.type === 'image')
      return (
        <img
          key={key}
          src={String(n.attrs?.src)}
          style={{ width: `${n.attrs?.width ?? 100}%` }}
          alt={String(n.attrs?.alt ?? 'Фотография конспекта')}
          tabIndex={0}
          onClick={() => setZoom(String(n.attrs?.src))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setZoom(String(n.attrs?.src));
          }}
        />
      );
    if (n.type === 'hardBreak') return <br key={key} />;
    if (n.type === 'horizontalRule') return <hr key={key} />;
    const tag =
      (
        {
          doc: 'div',
          paragraph: 'p',
          bulletList: 'ul',
          orderedList: 'ol',
          listItem: 'li',
          blockquote: 'blockquote',
          codeBlock: 'pre',
          heading: `h${Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)))}`,
        } as Record<string, string>
      )[n.type] ?? 'div';
    return createElement(tag, { key }, children);
  }
  return (
    <>
      <div className="rich-content">{render(doc, 0)}</div>
      {zoom && (
        <Modal title="Фотография конспекта" wide onClose={() => setZoom(undefined)}>
          <img className="zoom-image" src={zoom} alt="Фотография в полном размере" />
        </Modal>
      )}
    </>
  );
}
