import { scheduleFromReviews, scheduleReview } from '../../shared/scheduler';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Check, Sparkles } from 'lucide-react';
import type { Card, Rating } from '../../shared/model';
import { useStore } from '../hooks/useStore';
import { Content } from '../components/Content';
import { repeatIds } from '../../shared/study';
export function Study({
  sessionId,
  onClose,
  onRepeat,
}: {
  sessionId: string;
  onClose: () => void;
  onRepeat: (ids: string[]) => void;
}) {
  const { data, call, task } = useStore();
  const session = data.sessions.find((s) => s.id === sessionId)!;
  const cards = session.cardIds
    .map((id) => data.cards.find((c) => c.id === id))
    .filter((c): c is Card => Boolean(c));
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      cards.findIndex((c) => !session.results.some((r) => r.cardId === c.id)),
    ),
  );
  const [back, setBack] = useState(false);
  const [finished, setFinished] = useState(Boolean(session.endedAt));
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const card = cards[index];
  const day = new Date().toISOString().slice(0, 10);
  const previous = scheduleFromReviews(
    data.sessions
      .flatMap((s) => s.results)
      .filter((r) => r.cardId === card?.id && r.reviewedAt.slice(0, 10) < day),
  );
  const interval = (rating: Rating) =>
    scheduleReview(previous, rating, new Date().toISOString()).intervalDays;
  useEffect(() => {
    setBack(false);
    content.current?.scrollTo(0, 0);
  }, [index]);
  async function end() {
    if (busy.current) return;
    busy.current = true;
    try {
      await call('endSession', { id: sessionId });
      setFinished(true);
    } finally {
      busy.current = false;
    }
  }
  async function rate(rating: Rating) {
    if (!back || !card || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await call('rateCard', { sessionId, cardId: card.id, rating });
      if (index + 1 < cards.length) setIndex((i) => i + 1);
      else {
        await call('endSession', { id: sessionId });
        setFinished(true);
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest('input,textarea,select,[contenteditable="true"],dialog')
      )
        return;
      if (e.repeat || busy.current || finished) return;
      const actions: Record<string, () => void> = {
        ' ': () => setBack((v) => !v),
        ArrowRight: () => setIndex((i) => Math.min(cards.length - 1, i + 1)),
        ArrowLeft: () => setIndex((i) => Math.max(0, i - 1)),
        '1': () => void task(() => rate('unknown')),
        '2': () => void task(() => rate('hard')),
        '3': () => void task(() => rate('known')),
        Escape: () => void task(end),
      };
      if (actions[e.key]) {
        e.preventDefault();
        actions[e.key]();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  if (finished) {
    const count = (rating: Rating) => session.results.filter((r) => r.rating === rating).length;
    return (
      <main className="study-summary">
        <div className="summary-icon">
          <Check size={38} />
        </div>
        <div className="eyebrow">ЕЩЁ ОДИН ШАГ ВПЕРЁД</div>
        <h1>Отличная работа</h1>
        <p className="muted">
          Вы оценили {session.results.length} из {cards.length} карточек. Каждый подход помогает
          запомнить больше.
        </p>
        <div className="result-grid">
          {(
            [
              ['known', 'Знаю'],
              ['hard', 'Сложно'],
              ['unknown', 'Не знаю'],
            ] as const
          ).map(([r, l]) => (
            <div className={`result ${r}`} key={r}>
              <strong>{count(r)}</strong>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div className="summary-actions">
          <button className="primary" onClick={() => onRepeat(cards.map((c) => c.id))}>
            <RotateCw size={17} />
            Повторить все
          </button>
          <button disabled={!count('hard')} onClick={() => onRepeat(repeatIds(session, ['hard']))}>
            Повторить сложные
          </button>
          <button
            disabled={!count('unknown')}
            onClick={() => onRepeat(repeatIds(session, ['unknown']))}
          >
            Повторить неизвестные
          </button>
          <button className="text-button" onClick={onClose}>
            Вернуться к карточкам
          </button>
        </div>
      </main>
    );
  }
  if (!card) return null;
  return (
    <main className="study-page">
      <header className="study-header">
        <div>
          <span className="eyebrow">СЕССИЯ ИЗУЧЕНИЯ</span>
          <h3>{data.decks.find((d) => d.id === card.deckId)?.name}</h3>
        </div>
        <div className="actions">
          <button onClick={onClose}>Пауза</button>
          <button onClick={() => void task(end)}>
            <X size={17} />
            Завершить
          </button>
        </div>
      </header>
      <div className="study-progress">
        <span>
          Карточка <b>{index + 1}</b> / {cards.length}
        </span>
        <span>Оценено {session.results.length}</span>
      </div>
      <div className="progress-track">
        <div style={{ width: `${((index + 1) / cards.length) * 100}%` }} />
      </div>
      <div className={`flashcard ${back ? 'show-back' : ''}`}>
        <div className="flashcard-top">
          <span className="badge">{card.type}</span>
          <span>{back ? 'ОБРАТНАЯ СТОРОНА' : 'ЛИЦЕВАЯ СТОРОНА'}</span>
        </div>
        <div ref={content} className="flashcard-content" key={`${card.id}-${back}`}>
          <Content doc={back ? card.back : card.front} />
        </div>
        <div className="flashcard-bottom">
          <Sparkles size={14} />
          {back
            ? 'Сравните ответ с тем, что вспомнили'
            : 'Сначала попробуйте вспомнить самостоятельно'}
        </div>
      </div>
      <div className="study-controls">
        <button
          aria-label="Предыдущая карточка"
          disabled={index === 0 || saving}
          onClick={() => setIndex((i) => i - 1)}
        >
          <ArrowLeft size={20} />
        </button>
        {back ? (
          <div className="ratings">
            <button
              className="unknown"
              disabled={saving}
              onClick={() => void task(() => rate('unknown'))}
            >
              Не знаю <kbd>1</kbd>
              <small className="schedule-info">Через {interval('unknown')} дн.</small>
            </button>
            <button
              className="hard"
              disabled={saving}
              onClick={() => void task(() => rate('hard'))}
            >
              Сложно <kbd>2</kbd>
              <small className="schedule-info">Через {interval('hard')} дн.</small>
            </button>
            <button
              className="known"
              disabled={saving}
              onClick={() => void task(() => rate('known'))}
            >
              Знаю <kbd>3</kbd>
              <small className="schedule-info">Через {interval('known')} дн.</small>
            </button>
          </div>
        ) : (
          <button className="primary reveal" onClick={() => setBack(true)}>
            Показать ответ <kbd>Space</kbd>
          </button>
        )}
        <button
          aria-label="Следующая карточка"
          disabled={index === cards.length - 1 || saving}
          onClick={() => setIndex((i) => i + 1)}
        >
          <ArrowRight size={20} />
        </button>
      </div>
      <p className="study-hint">
        Space — переворот · ← → — навигация · 1 / 2 / 3 — оценка · Esc — завершить
      </p>
    </main>
  );
}
