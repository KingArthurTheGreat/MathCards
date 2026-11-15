import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, Save } from 'lucide-react';
import { cardTypes, emptyDoc, type Card, type CardInput } from '../../shared/model';
import { useStore } from '../hooks/useStore';
import { RichEditor } from '../components/RichEditor';
import { Content } from '../components/Content';
import { Modal } from '../components/Modal';
export function CardEditor({
  card,
  deckId,
  onClose,
}: {
  card?: Card;
  deckId?: string;
  onClose: () => void;
}) {
  const { data, call, task, notify } = useStore();
  const [form, setForm] = useState<CardInput>(
    card ?? {
      title: '',
      type: 'Теорема',
      deckId: deckId ?? data.decks[0]?.id ?? '',
      front: emptyDoc(),
      back: emptyDoc(),
      tags: [],
    },
  );
  const [tags, setTags] = useState(form.tags.join(', '));
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState(false);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function update(v: Partial<CardInput>) {
    setForm((f) => ({ ...f, ...v }));
    setDirty(true);
  }
  function save() {
    void task(async () => {
      setSaving(true);
      try {
        await call('saveCard', {
          ...form,
          tags: [
            ...new Set(
              tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            ),
          ],
        });
        setDirty(false);
        notify('Карточка сохранена');
        onClose();
      } finally {
        setSaving(false);
      }
    });
  }
  return (
    <main className="page editor-page">
      <div className="page-heading">
        <div>
          <button className="text-button" onClick={() => (dirty ? setLeave(true) : onClose())}>
            <ArrowLeft size={16} /> К карточкам
          </button>
          <h1>{card ? 'Редактирование карточки' : 'Новая карточка'}</h1>
          <p>Один вопрос. Одно открытие.</p>
        </div>
        <div className="actions">
          <button onClick={() => setPreview(true)}>
            <Eye size={17} />
            Предпросмотр
          </button>
          <button
            className="primary"
            disabled={saving || pending > 0 || !form.title.trim() || !form.deckId}
            onClick={save}
          >
            <Save size={17} />
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
      <div className="panel form-grid">
        <label className="span-2">
          Название
          <input
            autoFocus
            aria-label="Название карточки"
            maxLength={300}
            placeholder="Например, теорема Вейерштрасса"
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </label>
        <label>
          Тип
          <select
            value={form.type}
            onChange={(e) => update({ type: e.target.value as CardInput['type'] })}
          >
            {cardTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Набор
          <select
            aria-label="Набор"
            value={form.deckId}
            onChange={(e) => update({ deckId: e.target.value })}
          >
            {data.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Теги через запятую
          <input
            value={tags}
            placeholder="Экзамен, билет 12, важное"
            onChange={(e) => {
              setTags(e.target.value);
              setDirty(true);
            }}
          />
        </label>
      </div>
      <div className="editors">
        <RichEditor
          label="Лицевая сторона"
          value={form.front}
          onChange={(front) => update({ front })}
          onPending={(delta) => setPending((n) => n + delta)}
        />
        <RichEditor
          label="Обратная сторона"
          value={form.back}
          onChange={(back) => update({ back })}
          onPending={(delta) => setPending((n) => n + delta)}
        />
      </div>
      <div className="save-note">
        {dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'} · Фотографии остаются в
        приложении после удаления исходного файла.
      </div>
      {preview && (
        <Modal title="Предпросмотр карточки" wide onClose={() => setPreview(false)}>
          <div className="preview-grid">
            <section>
              <h3>Лицевая сторона</h3>
              <Content doc={form.front} />
            </section>
            <section>
              <h3>Обратная сторона</h3>
              <Content doc={form.back} />
            </section>
          </div>
        </Modal>
      )}
      {leave && (
        <Modal title="Есть несохранённые изменения" onClose={() => setLeave(false)}>
          <p>Сохраните карточку или вернитесь без сохранения.</p>
          <div className="modal-actions">
            <button onClick={() => setLeave(false)}>Продолжить редактирование</button>
            <button className="danger" onClick={onClose}>
              Выйти без сохранения
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
