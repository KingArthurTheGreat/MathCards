import { useMemo, useState } from 'react';
import {
  Plus,
  Play,
  Search,
  Copy,
  Pencil,
  Trash2,
  FolderInput,
  BookmarkPlus,
  Download,
  Shuffle,
  CheckSquare,
  X,
} from 'lucide-react';
import { cardTypes, type Card, type Collection, type Deck } from '../../shared/model';
import { selectRange } from '../../shared/study';
import { useStore } from '../hooks/useStore';
import { Modal, Confirm } from '../components/Modal';
import { DeckForm } from '../components/DeckForm';
export function Cards({
  deck,
  collection,
  review = false,
  onEdit,
  onStudy,
  onDeleted,
}: {
  deck?: Deck;
  collection?: Collection;
  review?: boolean;
  onEdit: (card?: Card) => void;
  onStudy: (ids: string[], random: boolean) => void;
  onDeleted: () => void;
}) {
  const { data, call, task, notify } = useStore();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number>();
  const [random, setRandom] = useState(false);
  const [dialog, setDialog] = useState<
    'collection' | 'move' | 'delete' | 'deckDelete' | 'collectionDelete' | 'rename' | 'range'
  >();
  const [name, setName] = useState(collection?.name ?? '');
  const [target, setTarget] = useState(data.decks[0]?.id ?? '');
  const [range, setRange] = useState([1, 3]);
  const [deckEdit, setDeckEdit] = useState(false);
  const base = data.cards.filter(
    (c) =>
      (!deck || c.deckId === deck.id) &&
      (!collection || collection.cardIds.includes(c.id)) &&
      (!review || c.lastRating === 'hard' || c.lastRating === 'unknown'),
  );
  const cards = useMemo(
    () =>
      base.filter(
        (c) =>
          c.title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')) &&
          (!type || c.type === type) &&
          (!tag || c.tags.includes(tag)),
      ),
    [base, query, type, tag],
  );
  const chosen = [...selected].filter((id) => base.some((c) => c.id === id));
  const tags = [...new Set(base.flatMap((c) => c.tags))].sort();
  function toggle(i: number, shift: boolean) {
    const id = cards[i].id;
    setSelected((old) => {
      const next = new Set(old);
      if (shift && anchor !== undefined)
        selectRange(cards, anchor, i).forEach((id) => next.add(id));
      else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(i);
  }
  const close = () => setDialog(undefined);
  return (
    <main className="page">
      <div className="breadcrumbs">
        Библиотека <span>/</span>{' '}
        {deck ? 'Набор' : collection ? 'Подборка' : review ? 'Повторение' : 'Все карточки'}
      </div>
      <div className="page-heading">
        <div>
          <h1>
            {deck?.name ?? collection?.name ?? (review ? 'Вспомнить и закрепить' : 'Все карточки')}
          </h1>
          <p>
            {deck?.description ||
              (collection
                ? 'Подборка ссылается на исходные карточки. Изменения синхронизируются автоматически.'
                : review
                  ? 'Карточки с последней оценкой «Сложно» и «Не знаю».'
                  : 'Ваши определения, теоремы и маленькие открытия.')}
          </p>
          <span className="small muted">
            {base.length} карточек{deck?.demo ? ' · Учебные примеры' : ''}
          </span>
        </div>
        <div className="actions">
          {deck && (
            <>
              <button
                className="icon-button"
                title="Редактировать набор"
                onClick={() => setDeckEdit(true)}
              >
                <Pencil size={18} />
              </button>
              <button
                className="icon-button"
                title="Экспортировать набор"
                onClick={() =>
                  void task(async () => {
                    if (await call('export', { deckIds: [deck.id] })) notify('Набор экспортирован');
                  })
                }
              >
                <Download size={18} />
              </button>
              <button
                className="icon-button"
                title="Удалить набор"
                onClick={() => setDialog('deckDelete')}
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
          {collection && (
            <>
              <button
                title="Переименовать подборку"
                className="icon-button"
                onClick={() => setDialog('rename')}
              >
                <Pencil size={18} />
              </button>
              <button
                title="Удалить подборку"
                className="icon-button"
                onClick={() => setDialog('collectionDelete')}
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
          <button className="primary" disabled={!data.decks.length} onClick={() => onEdit()}>
            <Plus size={18} />
            Добавить карточку
          </button>
        </div>
      </div>
      <div className="panel library">
        <div className="filters">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Поиск карточек"
              placeholder="Найти карточку по названию…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setAnchor(undefined);
              }}
            />
          </div>
          <select
            aria-label="Фильтр по типу"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setAnchor(undefined);
            }}
          >
            <option value="">Все типы</option>
            {cardTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Фильтр по тегу"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setAnchor(undefined);
            }}
          >
            <option value="">Все теги</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="selection-toolbar">
          <div className="actions">
            <button
              className="text-button"
              onClick={() => setSelected(new Set([...selected, ...cards.map((c) => c.id)]))}
            >
              <CheckSquare size={16} />
              Выделить все ({cards.length})
            </button>
            <button
              className="text-button"
              disabled={!chosen.length}
              onClick={() => setSelected(new Set())}
            >
              Снять выделение
            </button>
            <button
              className="text-button"
              disabled={!cards.length}
              onClick={() => setDialog('range')}
            >
              Диапазон
            </button>
          </div>
          <span className="small muted">Shift + клик для диапазона</span>
        </div>
        <div className="card-table">
          <div className="table-head">
            <span />
            <span>КАРТОЧКА</span>
            <span>ТИП</span>
            <span>ПОВТОРЕНИЕ</span>
            <span />
          </div>
          {cards.length ? (
            cards.map((c, i) => (
              <div className={`card-row ${selected.has(c.id) ? 'selected' : ''}`} key={c.id}>
                <input
                  type="checkbox"
                  aria-label={`Выбрать ${c.title}`}
                  checked={selected.has(c.id)}
                  onChange={() => {}}
                  onClick={(e) => toggle(i, e.shiftKey)}
                />
                <div className="card-info">
                  <button className="card-title" onClick={() => onEdit(c)}>
                    <span className="row-number">{String(i + 1).padStart(2, '0')}</span>
                    {c.title}
                  </button>
                  <div className="tags">
                    {!deck && <span>{data.decks.find((d) => d.id === c.deckId)?.name}</span>}
                    {c.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </div>
                <span className={`type-tag type-${cardTypes.indexOf(c.type)}`}>{c.type}</span>
                <span className={`rating-dot ${c.lastRating ?? 'new'}`}>
                  {c.lastRating === 'known'
                    ? 'Знаю'
                    : c.lastRating === 'hard'
                      ? 'Сложно'
                      : c.lastRating === 'unknown'
                        ? 'Не знаю'
                        : 'Новая'}
                </span>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    title="Дублировать карточку"
                    onClick={() =>
                      void task(async () => {
                        await call('duplicateCard', { id: c.id });
                        notify('Копия создана');
                      })
                    }
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Редактировать карточку"
                    onClick={() => onEdit(c)}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">
              <Search size={30} />
              <h3>{base.length ? 'Ничего не найдено' : 'Здесь появятся ваши карточки'}</h3>
              <p>
                {base.length
                  ? 'Попробуйте изменить запрос или фильтры.'
                  : 'Добавьте первую карточку и начните подготовку.'}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="selection-bar">
        <div>
          <b>Выбрано {chosen.length}</b>
          <span className="muted small">
            {chosen.filter((id) => !cards.some((c) => c.id === id)).length > 0
              ? 'Включая карточки вне текущего фильтра'
              : 'Изучайте именно то, что нужно сейчас'}
          </span>
        </div>
        <div className="actions">
          <button
            title="Сохранить подборку"
            disabled={!chosen.length}
            onClick={() => {
              setName('');
              setDialog('collection');
            }}
          >
            <BookmarkPlus size={17} />
            <span>В подборку</span>
          </button>
          <button
            title="Переместить выбранные"
            className="icon-button"
            disabled={!chosen.length}
            onClick={() => setDialog('move')}
          >
            <FolderInput size={18} />
          </button>
          {collection && (
            <button
              title="Убрать выбранные из подборки"
              className="icon-button"
              disabled={!chosen.length}
              onClick={() =>
                void task(async () => {
                  await call('saveCollection', {
                    ...collection,
                    cardIds: collection.cardIds.filter((id) => !selected.has(id)),
                  });
                  setSelected(new Set());
                })
              }
            >
              <X size={18} />
            </button>
          )}
          <button
            title="Удалить выбранные карточки"
            className="icon-button"
            disabled={!chosen.length}
            onClick={() => setDialog('delete')}
          >
            <Trash2 size={18} />
          </button>
          <label className="check-line small">
            <input type="checkbox" checked={random} onChange={(e) => setRandom(e.target.checked)} />
            <Shuffle size={16} />
            Перемешать
          </label>
          <button
            className="primary"
            disabled={!chosen.length}
            onClick={() => onStudy(chosen, random)}
          >
            <Play size={17} />
            Изучать выбранные
          </button>
        </div>
      </div>
      {deckEdit && <DeckForm deck={deck} onClose={() => setDeckEdit(false)} />}
      {(dialog === 'delete' || dialog === 'deckDelete' || dialog === 'collectionDelete') && (
        <Confirm
          title={
            dialog === 'delete'
              ? `Удалить карточки (${chosen.length})?`
              : dialog === 'deckDelete'
                ? 'Удалить набор?'
                : 'Удалить подборку?'
          }
          text={
            dialog === 'collectionDelete'
              ? 'Исходные карточки останутся в своих наборах.'
              : 'Карточки исчезнут из всех подборок вместе с историей повторений. Это действие нельзя отменить. При необходимости сначала экспортируйте набор.'
          }
          onClose={close}
          onConfirm={() =>
            task(async () => {
              if (dialog === 'delete') {
                await call('deleteCards', { ids: chosen });
                setSelected(new Set());
              } else if (dialog === 'deckDelete') {
                await call('deleteDeck', { id: deck!.id });
                onDeleted();
              } else {
                await call('deleteCollection', { id: collection!.id });
                onDeleted();
              }
              close();
            })
          }
        />
      )}
      {(dialog === 'collection' || dialog === 'rename') && (
        <Modal
          title={dialog === 'rename' ? 'Название подборки' : 'Сохранить подборку'}
          onClose={close}
        >
          <label>
            Название
            <input
              autoFocus
              aria-label="Название подборки"
              maxLength={300}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Повторить перед экзаменом"
            />
          </label>
          <p className="muted small">Подборки хранят ссылки на карточки, не создавая копий.</p>
          <div className="modal-actions">
            <button onClick={close}>Отмена</button>
            <button
              className="primary"
              disabled={!name.trim()}
              onClick={() =>
                void task(async () => {
                  await call('saveCollection', {
                    id: dialog === 'rename' ? collection!.id : undefined,
                    name,
                    cardIds: dialog === 'rename' ? collection!.cardIds : chosen,
                  });
                  close();
                  notify('Подборка сохранена');
                })
              }
            >
              Сохранить подборку
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'move' && (
        <Modal title="Переместить карточки" onClose={close}>
          <label>
            Набор назначения
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {data.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button onClick={close}>Отмена</button>
            <button
              className="primary"
              onClick={() =>
                void task(async () => {
                  await call('moveCards', { ids: chosen, deckId: target });
                  setSelected(new Set());
                  close();
                })
              }
            >
              Переместить
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'range' && (
        <Modal title="Выбрать диапазон" onClose={close}>
          <p className="muted">Номера относятся к текущему отфильтрованному списку.</p>
          <div className="form-grid">
            <label>
              От
              <input
                type="number"
                min={1}
                max={cards.length}
                value={range[0]}
                onChange={(e) => setRange([Number(e.target.value), range[1]])}
              />
            </label>
            <label>
              До
              <input
                type="number"
                min={1}
                max={cards.length}
                value={range[1]}
                onChange={(e) => setRange([range[0], Number(e.target.value)])}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button
              className="primary"
              disabled={range.some((n) => !Number.isInteger(n) || n < 1 || n > cards.length)}
              onClick={() => {
                setSelected(
                  new Set([...selected, ...selectRange(cards, range[0] - 1, range[1] - 1)]),
                );
                close();
              }}
            >
              Выбрать диапазон
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
