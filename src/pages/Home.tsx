import { isDue } from '../../shared/scheduler';
import {
  ArrowUpRight,
  BookOpen,
  Layers,
  Sparkles,
  Play,
  Plus,
  ArrowRight,
  Clock3,
  GraduationCap,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { Formula } from '../components/Content';
export function DeckTile({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { data } = useStore();
  const d = data.decks.find((d) => d.id === id)!;
  const cards = data.cards.filter((c) => c.deckId === id);
  const known = cards.filter((c) => c.lastRating === 'known').length;
  return (
    <button className="deck-tile" onClick={() => onOpen(id)}>
      <div className="deck-tile-top">
        <div className="deck-icon">
          <BookOpen size={23} />
        </div>
        <ArrowUpRight size={19} />
      </div>
      <h3>{d.name}</h3>
      <p>{d.description || 'Всё начинается с одной карточки.'}</p>
      <div className="deck-meta">
        <span>{cards.length} карточек</span>
        {d.demo && <span className="demo-label">Примеры</span>}
      </div>
      <div className="progress-track">
        <div style={{ width: `${cards.length ? (known / cards.length) * 100 : 0}%` }} />
      </div>
      <div className="small muted">
        {known} из {cards.length} уверенно знаете
      </div>
    </button>
  );
}
export function Home({
  onDeck,
  onNew,
  onAll,
  onReview,
  onStudy,
  onResume,
}: {
  onDeck: (id: string) => void;
  onNew: () => void;
  onAll: () => void;
  onReview: () => void;
  onStudy: (ids: string[]) => void;
  onResume: (id: string) => void;
}) {
  const { data } = useStore();
  const difficult = data.cards.filter((c) => isDue(c));
  const recent = [...data.decks]
    .sort((a, b) => (b.openedAt ?? b.createdAt).localeCompare(a.openedAt ?? a.createdAt))
    .slice(0, 3);
  const today = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
  const reviews = data.sessions.flatMap((s) => s.results);
  const week = reviews.filter((r) => Date.now() - Date.parse(r.reviewedAt) < 7 * 86400000).length;
  return (
    <main className="page home-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАШЕ ПРОСТРАНСТВО ДЛЯ МАТЕМАТИКИ</div>
          <h1>Большие идеи. Маленькие шаги.</h1>
          <p>Освежите знания сегодня — почувствуйте уверенность на экзамене.</p>
        </div>
        <span className="date-label">{today}</span>
      </div>
      {data.sessions
        .filter((s) => !s.endedAt && s.cardIds.length > s.results.length)
        .slice(0, 1)
        .map((s) => (
          <div className="panel resume-banner" key={s.id}>
            <div>
              <h3>Продолжить подготовку</h3>
              <p className="muted small">
                Оценено {s.results.length} из {s.cardIds.length} карточек. Результаты сохранены.
              </p>
            </div>
            <button onClick={() => onResume(s.id)} className="primary">
              Продолжить сессию
            </button>
          </div>
        ))}
      <section className="hero">
        <div className="hero-copy">
          <span className="pill">
            <Sparkles size={14} />
            Учиться в своём ритме
          </span>
          <h2>
            Понимать глубже.
            <br />
            Запоминать надолго.
          </h2>
          <p>
            Одна теорема за другой. Соберите свои знания
            <br className="desktop-break" /> в карточки и возвращайтесь к самому важному.
          </p>
          <button
            className="primary"
            disabled={!data.cards.length}
            onClick={() => onStudy((difficult.length ? difficult : data.cards).map((c) => c.id))}
          >
            <Play size={17} />
            Начать изучение
            <ArrowRight size={17} />
          </button>
          <span className="hero-foot">
            {difficult.length
              ? `${difficult.length} карточек ждут повторения`
              : 'Даже 10 минут — уже хороший результат'}
          </span>
        </div>
        <div className="math-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="math-label top">ε &gt; 0</span>
          <span className="math-label bottom">∞ возможностей</span>
          <div className="art-card back-card" />
          <div className="art-card front-card">
            <span>МАЛЕНЬКОЕ НАПОМИНАНИЕ</span>
            <div className="art-formula">
              <Formula latex={String.raw`\lim_{x\to0}\frac{\sin x}{x}=1`} />
            </div>
            <div className="art-divider" />
            <p>
              Всё сложное начинается
              <br />с простого.
            </p>
            <span className="art-dot">✓</span>
          </div>
        </div>
      </section>
      <section className="stats-grid">
        {[
          {
            icon: BookOpen,
            label: 'Наборы',
            value: data.decks.length,
            detail: 'Каждая тема на своём месте',
            action: onAll,
          },
          {
            icon: Layers,
            label: 'Карточки',
            value: data.cards.length,
            detail: 'Ваша личная база знаний',
            action: onAll,
          },
          {
            icon: Clock3,
            label: 'К повторению',
            value: difficult.length,
            detail: 'Уделите им немного внимания',
            action: onReview,
          },
          {
            icon: GraduationCap,
            label: 'За неделю',
            value: week,
            detail: 'Оценок в учебных сессиях',
            action: onReview,
          },
        ].map(({ icon: Icon, label, value, detail, action }) => (
          <button className="stat-card" key={label} onClick={action}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </section>
      <div className="section-heading">
        <div>
          <h2>Ваши наборы</h2>
          <p>Продолжите с того места, где остановились.</p>
        </div>
        <button className="text-button" onClick={onAll}>
          Все наборы
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="deck-grid">
        {recent.map((d) => (
          <DeckTile key={d.id} id={d.id} onOpen={onDeck} />
        ))}
        {recent.length < 3 && (
          <button className="new-deck" onClick={onNew}>
            <Plus size={26} />
            <h3>Создать набор</h3>
            <p>Новая тема — новая глава.</p>
          </button>
        )}
      </div>
      <div className="home-tip">
        <span>✦</span>
        <div>
          <strong>Вспоминать полезнее, чем перечитывать</strong>
          <p>Прежде чем перевернуть карточку, сформулируйте ответ своими словами.</p>
        </div>
      </div>
    </main>
  );
}
