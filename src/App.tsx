import { useRef, useState } from 'react';
import {
  Home as HomeIcon,
  BookOpen,
  Layers,
  Bookmark,
  RotateCw,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Plus,
  ChevronRight,
  WifiOff,
  ArrowUpRight,
} from 'lucide-react';
import type { Card } from '../shared/model';
import { shuffle } from '../shared/study';
import { useStore } from './hooks/useStore';
import { Home, DeckTile } from './pages/Home';
import { Cards } from './pages/Cards';
import { Study } from './pages/Study';
import { CardEditor } from './pages/CardEditor';
import { Statistics } from './pages/Statistics';
import { Settings } from './pages/Settings';
import { DeckForm } from './components/DeckForm';
import { Modal } from './components/Modal';
type Page = 'home' | 'decks' | 'cards' | 'collections' | 'review' | 'stats' | 'settings';
const nav = [
  { id: 'home', label: 'Главная', icon: HomeIcon },
  { id: 'decks', label: 'Все наборы', icon: BookOpen },
  { id: 'cards', label: 'Все карточки', icon: Layers },
  { id: 'collections', label: 'Подборки', icon: Bookmark },
  { id: 'review', label: 'Повторение', icon: RotateCw },
  { id: 'stats', label: 'Статистика', icon: ChartNoAxesCombined },
] as const;
export default function App() {
  const { data, call, task } = useStore();
  const [page, setPage] = useState<Page>('home');
  const [deckId, setDeckId] = useState<string>();
  const [collectionId, setCollectionId] = useState<string>();
  const [newDeck, setNewDeck] = useState(false);
  const [editor, setEditor] = useState<{ card?: Card }>();
  const [sessionId, setSessionId] = useState<string>();
  const starting = useRef(false);
  function navigate(page: Page) {
    setPage(page);
    setDeckId(undefined);
    setCollectionId(undefined);
  }
  function openDeck(id: string) {
    setDeckId(id);
    setCollectionId(undefined);
    setPage('cards');
    void task(async () => {
      await call('openDeck', { id });
    });
  }
  function start(ids: string[], random = false) {
    void task(async () => {
      if (starting.current || !ids.length) return;
      starting.current = true;
      try {
        const id = await call('startSession', { cardIds: random ? shuffle(ids) : ids });
        setSessionId(id);
      } finally {
        starting.current = false;
      }
    });
  }
  if (sessionId)
    return (
      <Study
        key={sessionId}
        sessionId={sessionId}
        onClose={() => setSessionId(undefined)}
        onRepeat={(ids) => start(ids)}
      />
    );
  if (editor)
    return <CardEditor card={editor.card} deckId={deckId} onClose={() => setEditor(undefined)} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('home')}>
          <span className="logo">∫</span>
          <span>
            MathCards<small>Понимание через повторение</small>
          </span>
        </button>
        <span className="nav-label">МОЁ ПРОСТРАНСТВО</span>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id && !deckId && !collectionId ? 'active' : ''}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {id === 'review' &&
                data.cards.some((c) => c.lastRating === 'hard' || c.lastRating === 'unknown') && (
                  <span className="nav-count">
                    {
                      data.cards.filter(
                        (c) => c.lastRating === 'hard' || c.lastRating === 'unknown',
                      ).length
                    }
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-section">
          <div className="nav-label">
            МОИ НАБОРЫ
            <button title="Создать набор" className="icon-button" onClick={() => setNewDeck(true)}>
              <Plus size={15} />
            </button>
          </div>
          <div className="sidebar-decks">
            {data.decks.slice(0, 8).map((d, i) => (
              <button
                key={d.id}
                className={deckId === d.id ? 'active' : ''}
                onClick={() => openDeck(d.id)}
              >
                <i className={`deck-dot color-${i % 4}`} />
                <span>{d.name}</span>
                <ChevronRight size={14} />
              </button>
            ))}
            {!data.decks.length && <p className="small muted">Ваш первый набор появится здесь.</p>}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="offline-note">
            <WifiOff size={16} />
            <div>
              <b>Всегда под рукой</b>
              <small>Работает без интернета</small>
            </div>
          </div>
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => navigate('settings')}
          >
            <SettingsIcon size={19} />
            Настройки
          </button>
          <span className="version">MathCards · 1.0.0</span>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            <span className="status-dot" />
            Личное пространство
          </span>
          <div>
            <span>Математический анализ</span>
            <span className="avatar">М</span>
          </div>
        </header>
        {page === 'home' && (
          <Home
            onDeck={openDeck}
            onNew={() => setNewDeck(true)}
            onAll={() => navigate('decks')}
            onReview={() => navigate('review')}
            onStudy={(ids) => start(ids)}
          />
        )}
        {page === 'decks' && (
          <main className="page">
            <div className="page-heading">
              <div>
                <h1>Все наборы</h1>
                <p>Разложите знания по темам. Соберите картину целиком.</p>
              </div>
              <button className="primary" onClick={() => setNewDeck(true)}>
                <Plus size={18} />
                Создать набор
              </button>
            </div>
            <div className="deck-grid">
              {data.decks.map((d) => (
                <DeckTile key={d.id} id={d.id} onOpen={openDeck} />
              ))}
              <button className="new-deck" onClick={() => setNewDeck(true)}>
                <Plus size={28} />
                <h3>Новый набор</h3>
                <p>Начните следующую тему.</p>
              </button>
            </div>
          </main>
        )}
        {(page === 'cards' || page === 'review') && (
          <Cards
            key={deckId ?? collectionId ?? page}
            deck={data.decks.find((d) => d.id === deckId)}
            collection={data.collections.find((c) => c.id === collectionId)}
            review={page === 'review'}
            onEdit={(card) => setEditor({ card })}
            onStudy={start}
            onDeleted={() => navigate('decks')}
          />
        )}
        {page === 'collections' && (
          <main className="page">
            <div className="page-heading">
              <div>
                <h1>Подборки</h1>
                <p>Только нужные карточки — к конкретному билету, теме или экзамену.</p>
              </div>
              <button className="primary" onClick={() => navigate('cards')}>
                <Plus size={18} />
                Выбрать карточки
              </button>
            </div>
            <div className="deck-grid">
              {data.collections.map((c) => (
                <button
                  className="deck-tile collection-tile"
                  key={c.id}
                  onClick={() => {
                    setCollectionId(c.id);
                    setPage('cards');
                  }}
                >
                  <div className="deck-tile-top">
                    <div className="deck-icon">
                      <Bookmark size={24} />
                    </div>
                    <ArrowUpRight size={18} />
                  </div>
                  <h3>{c.name}</h3>
                  <p>{c.cardIds.length} карточек · Всегда актуальная версия</p>
                </button>
              ))}
            </div>
            {!data.collections.length && (
              <div className="panel empty">
                <Bookmark size={32} />
                <h3>Соберите свой маршрут повторения</h3>
                <p>Выберите карточки галочками и нажмите «В подборку».</p>
              </div>
            )}
          </main>
        )}
        {page === 'stats' && <Statistics />}
        {page === 'settings' && <Settings />}
      </div>
      {newDeck && <DeckForm onClose={() => setNewDeck(false)} onSave={openDeck} />}
      {!data.settings.onboarded && (
        <Modal
          title="Добро пожаловать в MathCards"
          onClose={() =>
            void task(async () => {
              await call('demo', { action: 'skip' });
            })
          }
        >
          <div className="welcome-symbol">∫</div>
          <h3>Математика становится понятнее с практикой.</h3>
          <p className="muted">
            Создавайте карточки с формулами и фотографиями, выбирайте нужные и проверяйте себя. Всё
            сохраняется на вашем компьютере.
          </p>
          <p>Начать с семи примеров о пределах и непрерывности?</p>
          <div className="modal-actions">
            <button
              onClick={() =>
                void task(async () => {
                  await call('demo', { action: 'skip' });
                })
              }
            >
              Начать с чистого листа
            </button>
            <button
              className="primary"
              onClick={() =>
                void task(async () => {
                  await call('demo', { action: 'install' });
                })
              }
            >
              Добавить примеры
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
