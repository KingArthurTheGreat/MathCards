import { useState } from 'react';
import type { Deck } from '../../shared/model';
import { Modal } from './Modal';
import { useStore } from '../hooks/useStore';
export function DeckForm({
  deck,
  onClose,
  onSave,
}: {
  deck?: Deck;
  onClose: () => void;
  onSave?: (id: string) => void;
}) {
  const { call, task } = useStore();
  const [name, setName] = useState(deck?.name ?? '');
  const [description, setDescription] = useState(deck?.description ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={deck ? 'Редактировать набор' : 'Новый набор'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task(async () => {
            setBusy(true);
            try {
              const id = await call('saveDeck', { id: deck?.id, name, description });
              onClose();
              onSave?.(id);
            } finally {
              setBusy(false);
            }
          });
        }}
      >
        <label>
          Название набора
          <input
            aria-label="Название набора"
            autoFocus
            required
            maxLength={300}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Экзамен по матану"
          />
        </label>
        <label>
          Описание
          <textarea
            maxLength={3000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Темы, цели и всё, что важно для подготовки"
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" disabled={!name.trim() || busy}>
            Сохранить набор
          </button>
        </div>
      </form>
    </Modal>
  );
}
