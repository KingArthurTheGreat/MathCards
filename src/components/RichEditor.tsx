import { useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ResizableImage } from './ResizableImage';
import Mathematics from '@tiptap/extension-mathematics';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  ImagePlus,
  Undo2,
  Redo2,
  Sigma,
  Heading2,
} from 'lucide-react';
import type { Doc } from '../../shared/model';
import { useStore } from '../hooks/useStore';
import { Modal } from './Modal';
import { Formula } from './Content';
const symbols = [
  ['∀', '\\forall '],
  ['∃', '\\exists '],
  ['ε', '\\varepsilon '],
  ['δ', '\\delta '],
  ['∞', '\\infty '],
  ['∑', '\\sum_{n=1}^{\\infty} '],
  ['∫', '\\int_a^b '],
  ['lim', '\\lim_{x \\to 0} '],
  ['⇒', '\\Rightarrow '],
  ['⇔', '\\Leftrightarrow '],
  ['∈', '\\in '],
  ['⊂', '\\subset '],
];
export function RichEditor({
  label,
  value,
  onChange,
  onPending,
}: {
  label: string;
  value: Doc;
  onChange: (doc: Doc) => void;
  onPending: (delta: number) => void;
}) {
  const { task } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [math, setMath] = useState<{ latex: string; block: boolean; pos?: number }>();
  const [uploads, setUploads] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      ResizableImage.configure({ allowBase64: false }),
      Mathematics.configure({
        katexOptions: { trust: false, throwOnError: false, maxExpand: 1000, maxSize: 20 },
        inlineOptions: {
          onClick: (n, pos) => setMath({ latex: n.attrs.latex, block: false, pos }),
        },
        blockOptions: { onClick: (n, pos) => setMath({ latex: n.attrs.latex, block: true, pos }) },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as Doc),
    editorProps: {
      attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => {
        const images = Array.from(event.clipboardData?.files ?? []);
        if (images.length) {
          event.preventDefault();
          addFiles(images);
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length) {
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          if (pos !== undefined) editor?.commands.setTextSelection(pos);
          addFiles(files);
          return true;
        }
        return false;
      },
      transformPastedHTML: (html) => {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('img,iframe,script,style').forEach((n) => n.remove());
        return parsed.body.innerHTML;
      },
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      image: editor?.isActive('image'),
      bold: editor?.isActive('bold'),
      italic: editor?.isActive('italic'),
      width: editor?.getAttributes('image').width ?? 100,
    }),
  });
  function addFiles(files: File[]) {
    void task(async () => {
      setUploads((n) => n + 1);
      onPending(1);
      try {
        for (const f of files) {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type))
            throw new Error('Выберите PNG, JPEG или WebP');
          if (f.size > 20 * 1024 * 1024) throw new Error('Изображение больше 20 МБ');
          const src = await window.mathcards.invoke('addImage', {
            bytes: Array.from(new Uint8Array(await f.arrayBuffer())),
          });
          editor
            ?.chain()
            .focus()
            .setImage({ src, alt: f.name || 'Фотография конспекта' })
            .run();
        }
      } finally {
        setUploads((n) => n - 1);
        onPending(-1);
      }
    });
  }
  if (!editor) return null;
  const btn = (title: string, action: () => unknown, icon: React.ReactNode, active = false) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={active ? 'active' : ''}
      onClick={() => action()}
    >
      {icon}
    </button>
  );
  return (
    <section className="editor-box">
      <div className="editor-label">
        {label}
        <span>Текст, формулы и фотографии</span>
      </div>
      <div className="toolbar">
        {btn(
          'Жирный',
          () => editor.chain().focus().toggleBold().run(),
          <Bold size={16} />,
          state?.bold,
        )}
        {btn(
          'Курсив',
          () => editor.chain().focus().toggleItalic().run(),
          <Italic size={16} />,
          state?.italic,
        )}
        {btn(
          'Заголовок',
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          <Heading2 size={17} />,
        )}
        {btn(
          'Маркированный список',
          () => editor.chain().focus().toggleBulletList().run(),
          <List size={17} />,
        )}
        {btn(
          'Нумерованный список',
          () => editor.chain().focus().toggleOrderedList().run(),
          <ListOrdered size={17} />,
        )}
        <i />
        {btn(
          'Вставить формулу',
          () => setMath({ latex: '', block: true }),
          <>
            <Sigma size={17} />
            <span>Формула</span>
          </>,
        )}
        {btn('Добавить фотографию', () => file.current?.click(), <ImagePlus size={18} />)}
        <i />
        {btn('Отменить', () => editor.chain().focus().undo().run(), <Undo2 size={17} />)}
        {btn('Повторить', () => editor.chain().focus().redo().run(), <Redo2 size={17} />)}
        {state?.image && (
          <label className="image-size">
            Размер{' '}
            <select
              aria-label="Размер изображения"
              value={state.width}
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('image', { width: Number(e.target.value) })
                  .run()
              }
            >
              {![25, 50, 75, 100].includes(state.width) && (
                <option value={state.width}>{state.width}%</option>
              )}
              {[25, 50, 75, 100].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <EditorContent editor={editor} />
      <div className="editor-hint">
        {uploads
          ? 'Сохраняем фотографию…'
          : 'Вставьте фотографию через Ctrl+V или перетащите её сюда. Нажмите на формулу, чтобы изменить LaTeX.'}
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {math && (
        <Modal
          title={math.pos === undefined ? 'Новая формула' : 'Редактирование формулы'}
          onClose={() => setMath(undefined)}
        >
          <label>
            LaTeX
            <textarea
              autoFocus
              aria-label="LaTeX"
              className="latex-input"
              value={math.latex}
              placeholder={'\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'}
              onChange={(e) => setMath({ ...math, latex: e.target.value })}
            />
          </label>
          <div className="symbols">
            {symbols.map(([symbol, code]) => (
              <button key={symbol} onClick={() => setMath({ ...math, latex: math.latex + code })}>
                {symbol}
              </button>
            ))}
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={math.block}
              disabled={math.pos !== undefined}
              onChange={(e) => setMath({ ...math, block: e.target.checked })}
            />
            Отдельной строкой
          </label>
          <div className="formula-preview">
            <Formula latex={math.latex} block={math.block} />
          </div>
          <div className="modal-actions">
            <button onClick={() => setMath(undefined)}>Отмена</button>
            <button
              className="primary"
              disabled={!math.latex.trim()}
              onClick={() => {
                if (math.pos !== undefined) {
                  if (math.block)
                    editor
                      .chain()
                      .focus()
                      .updateBlockMath({ latex: math.latex, pos: math.pos })
                      .run();
                  else
                    editor
                      .chain()
                      .focus()
                      .updateInlineMath({ latex: math.latex, pos: math.pos })
                      .run();
                } else if (math.block)
                  editor.chain().focus().insertBlockMath({ latex: math.latex }).run();
                else editor.chain().focus().insertInlineMath({ latex: math.latex }).run();
                setMath(undefined);
              }}
            >
              Вставить формулу
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
