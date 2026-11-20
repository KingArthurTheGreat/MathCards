import {
  imageIds,
  type Card,
  type CardInput,
  type Collection,
  type Deck,
  type Settings,
  type Snapshot,
  type StudySession,
  type Commands,
} from './model';
import { schemas } from './validation';
import { demoDecks } from './demo';
import { scheduleFromReviews } from './scheduler';
const now = () => new Date().toISOString();
type Row = Record<string, any>;
export abstract class LibraryRepository {
  abstract all(sql: string, ...params: (string | number)[]): Row[];
  abstract run(sql: string, ...params: (string | number | null)[]): unknown;
  abstract exec(sql: string): void;
  abstract hasImage(id: string): boolean;
  abstract addImage(bytes: Uint8Array): string;
  constructor(
    public directory: string,
    protected uuid: () => string,
  ) {}
  protected migrate() {
    const version = Number((this.all('PRAGMA user_version')[0] as Row).user_version);
    if (version > 2)
      throw new Error('База создана более новой версией MathCards. Обновите приложение.');
    if (version === 0)
      this.exec(`BEGIN;
      CREATE TABLE decks(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, openedAt TEXT);
      CREATE TABLE cards(id TEXT PRIMARY KEY, deckId TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE, title TEXT NOT NULL, type TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE INDEX cards_deck ON cards(deckId);
      CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE card_tags(cardId TEXT REFERENCES cards(id) ON DELETE CASCADE, tagId TEXT REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(cardId,tagId));
      CREATE TABLE images(id TEXT PRIMARY KEY, createdAt TEXT NOT NULL);
      CREATE TABLE card_images(cardId TEXT REFERENCES cards(id) ON DELETE CASCADE, imageId TEXT REFERENCES images(id), PRIMARY KEY(cardId,imageId));
      CREATE TABLE collections(id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE collection_cards(collectionId TEXT REFERENCES collections(id) ON DELETE CASCADE, cardId TEXT REFERENCES cards(id) ON DELETE CASCADE, position INTEGER NOT NULL, PRIMARY KEY(collectionId,cardId));
      CREATE TABLE sessions(id TEXT PRIMARY KEY, startedAt TEXT NOT NULL, endedAt TEXT);
      CREATE TABLE session_cards(sessionId TEXT REFERENCES sessions(id) ON DELETE CASCADE, cardId TEXT REFERENCES cards(id) ON DELETE CASCADE, position INTEGER NOT NULL, PRIMARY KEY(sessionId,cardId));
      CREATE TABLE results(sessionId TEXT NOT NULL, cardId TEXT NOT NULL, rating TEXT NOT NULL CHECK(rating IN ('known','hard','unknown')), reviewedAt TEXT NOT NULL, PRIMARY KEY(sessionId,cardId), FOREIGN KEY(sessionId,cardId) REFERENCES session_cards(sessionId,cardId) ON DELETE CASCADE);
      CREATE INDEX results_card ON results(cardId,reviewedAt);
      CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=1; COMMIT;`);
    if (version < 2)
      this.transaction(() => {
        this.exec(`CREATE TABLE review_state(
        cardId TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
        repetitions INTEGER NOT NULL, intervalDays INTEGER NOT NULL, ease REAL NOT NULL,
        dueAt TEXT NOT NULL, reviewedAt TEXT NOT NULL);
        CREATE INDEX review_due ON review_state(dueAt);`);
        for (const card of this.all('SELECT id FROM cards')) this.rebuildSchedule(card.id);
        this.exec('PRAGMA user_version=2');
      });
  }
  transaction<T>(fn: () => T): T {
    this.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.exec('COMMIT');
      return result;
    } catch (err) {
      this.exec('ROLLBACK');
      throw err;
    }
  }
  require(table: 'cards' | 'decks' | 'collections' | 'sessions', id: string) {
    if (!this.all(`SELECT id FROM ${table} WHERE id=?`, id).length)
      throw new Error('Запись не найдена. Обновите страницу.');
  }
  rebuildSchedule(cardId: string) {
    const events = this.all(
      'SELECT rating,reviewedAt FROM results WHERE cardId=? ORDER BY reviewedAt,sessionId',
      cardId,
    );
    const state = scheduleFromReviews(
      events as { rating: Card['lastRating'] & string; reviewedAt: string }[],
    );
    if (!state) {
      this.run('DELETE FROM review_state WHERE cardId=?', cardId);
      return;
    }
    this.run(
      `INSERT INTO review_state VALUES(?,?,?,?,?,?) ON CONFLICT(cardId) DO UPDATE SET
      repetitions=excluded.repetitions,intervalDays=excluded.intervalDays,ease=excluded.ease,
      dueAt=excluded.dueAt,reviewedAt=excluded.reviewedAt`,
      cardId,
      state.repetitions,
      state.intervalDays,
      state.ease,
      state.dueAt,
      state.reviewedAt,
    );
  }
  snapshot(): Snapshot {
    const decks = this.all('SELECT * FROM decks ORDER BY createdAt,id').map((d) => ({
      ...d,
      demo: Boolean(d.demo),
    })) as Deck[];
    const tags = this.all(
      'SELECT ct.cardId,t.name FROM card_tags ct JOIN tags t ON t.id=ct.tagId ORDER BY t.name',
    );
    const reviews = this.all('SELECT * FROM results ORDER BY reviewedAt');
    const schedules = new Map(
      this.all('SELECT * FROM review_state').map(({ cardId, ...schedule }) => [cardId, schedule]),
    );
    const cards = this.all('SELECT * FROM cards ORDER BY createdAt,id').map((c) => {
      const r = reviews.filter((r) => r.cardId === c.id);
      return {
        ...c,
        front: JSON.parse(c.front),
        back: JSON.parse(c.back),
        tags: tags.filter((t) => t.cardId === c.id).map((t) => t.name),
        lastRating: r.at(-1)?.rating ?? null,
        reviewCount: r.length,
        schedule: schedules.get(c.id) ?? null,
      };
    }) as Card[];
    const collections = this.all('SELECT * FROM collections ORDER BY name').map((c) => ({
      ...c,
      cardIds: this.all(
        'SELECT cardId FROM collection_cards WHERE collectionId=? ORDER BY position',
        c.id,
      ).map((r) => r.cardId),
    })) as Collection[];
    const sessions = this.all('SELECT * FROM sessions ORDER BY startedAt DESC').map((s) => ({
      ...s,
      cardIds: this.all(
        'SELECT cardId FROM session_cards WHERE sessionId=? ORDER BY position',
        s.id,
      ).map((r) => r.cardId),
      results: reviews
        .filter((r) => r.sessionId === s.id)
        .map(({ cardId, rating, reviewedAt }) => ({ cardId, rating, reviewedAt })),
    })) as StudySession[];
    const settings: Settings = {
      theme: 'system',
      onboarded: false,
      ...JSON.parse(
        this.all("SELECT value FROM settings WHERE key='preferences'")[0]?.value ?? '{}',
      ),
    };
    return { decks, cards, collections, sessions, settings, dataPath: this.directory };
  }
  saveCard(input: CardInput): string {
    const c = schemas.saveCard.parse(input);
    this.require('decks', c.deckId);
    const id = c.id ?? this.uuid();
    if (c.id) this.require('cards', id);
    const images = [...new Set([...imageIds(c.front), ...imageIds(c.back)])];
    for (const image of images)
      if (!this.all('SELECT id FROM images WHERE id=?', image).length || !this.hasImage(image))
        throw new Error('Изображение не найдено. Вставьте его повторно.');
    this.run(
      `INSERT INTO cards VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET deckId=excluded.deckId,title=excluded.title,type=excluded.type,front=excluded.front,back=excluded.back,updatedAt=excluded.updatedAt`,
      id,
      c.deckId,
      c.title,
      c.type,
      JSON.stringify(c.front),
      JSON.stringify(c.back),
      now(),
      now(),
    );
    this.run('DELETE FROM card_tags WHERE cardId=?', id);
    for (const tag of new Set(c.tags)) {
      this.run('INSERT OR IGNORE INTO tags VALUES(?,?)', this.uuid(), tag);
      this.run('INSERT INTO card_tags SELECT ?,id FROM tags WHERE name=?', id, tag);
    }
    this.run('DELETE FROM card_images WHERE cardId=?', id);
    for (const image of images) this.run('INSERT INTO card_images VALUES(?,?)', id, image);
    return id;
  }
  execute<K extends keyof Commands>(
    command: K,
    payload: Commands[K]['input'],
  ): Commands[K]['output'] {
    const p: any = schemas[command].parse(payload);
    if (command === 'snapshot') return this.snapshot() as Commands[K]['output'];
    if (command === 'addImage')
      return this.addImage(Uint8Array.from(p.bytes)) as Commands[K]['output'];
    const result = this.transaction(() => {
      switch (command) {
        case 'saveDeck': {
          const id = p.id ?? this.uuid();
          if (p.id) this.require('decks', id);
          this.run(
            'INSERT INTO decks VALUES(?,?,?,0,?,NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description',
            id,
            p.name,
            p.description,
            now(),
          );
          return id;
        }
        case 'openDeck':
          this.run('UPDATE decks SET openedAt=? WHERE id=?', now(), p.id);
          break;
        case 'deleteDeck':
          this.require('decks', p.id);
          this.run('DELETE FROM decks WHERE id=?', p.id);
          break;
        case 'saveCard':
          return this.saveCard(p);
        case 'deleteCards':
          for (const id of p.ids) this.run('DELETE FROM cards WHERE id=?', id);
          break;
        case 'duplicateCard': {
          const card = this.snapshot().cards.find((c) => c.id === p.id);
          if (!card) throw new Error('Карточка не найдена');
          return this.saveCard({
            ...card,
            id: undefined,
            title: `${card.title.slice(0, 280)} — копия`,
          });
        }
        case 'moveCards':
          this.require('decks', p.deckId);
          for (const id of p.ids) {
            this.require('cards', id);
            this.run('UPDATE cards SET deckId=?,updatedAt=? WHERE id=?', p.deckId, now(), id);
          }
          break;
        case 'saveCollection': {
          const id = p.id ?? this.uuid();
          if (p.id) this.require('collections', id);
          this.run(
            'INSERT INTO collections VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',
            id,
            p.name,
          );
          this.run('DELETE FROM collection_cards WHERE collectionId=?', id);
          [...new Set<string>(p.cardIds)].forEach((cardId, i) => {
            this.require('cards', cardId);
            this.run('INSERT INTO collection_cards VALUES(?,?,?)', id, cardId, i);
          });
          return id;
        }
        case 'deleteCollection':
          this.run('DELETE FROM collections WHERE id=?', p.id);
          break;
        case 'startSession': {
          const id = this.uuid();
          this.run('INSERT INTO sessions VALUES(?,?,NULL)', id, now());
          [...new Set<string>(p.cardIds)].forEach((cardId, i) => {
            this.require('cards', cardId);
            this.run('INSERT INTO session_cards VALUES(?,?,?)', id, cardId, i);
          });
          return id;
        }
        case 'rateCard': {
          this.require('sessions', p.sessionId);
          if (this.all('SELECT endedAt FROM sessions WHERE id=?', p.sessionId)[0]?.endedAt)
            throw new Error('Сессия уже завершена');
          this.run(
            'INSERT INTO results VALUES(?,?,?,?) ON CONFLICT(sessionId,cardId) DO UPDATE SET rating=excluded.rating,reviewedAt=excluded.reviewedAt',
            p.sessionId,
            p.cardId,
            p.rating,
            now(),
          );
          this.rebuildSchedule(p.cardId);
          break;
        }
        case 'endSession':
          this.run('UPDATE sessions SET endedAt=COALESCE(endedAt,?) WHERE id=?', now(), p.id);
          break;
        case 'settings':
          this.run(
            "INSERT INTO settings VALUES('preferences',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            JSON.stringify(p),
          );
          break;
        case 'demo': {
          if (p.action === 'remove') this.run('DELETE FROM decks WHERE demo=1');
          if (p.action === 'install' && !this.all('SELECT id FROM decks WHERE demo=1').length)
            for (const deck of demoDecks) {
              const id = this.uuid();
              this.run(
                'INSERT INTO decks VALUES(?,?,?,1,?,NULL)',
                id,
                deck.name,
                'Учебные примеры. Можно редактировать или удалить в настройках.',
                now(),
              );
              for (const card of deck.cards) this.saveCard({ ...card, deckId: id });
            }
          this.run(
            "INSERT INTO settings VALUES('preferences',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            JSON.stringify({ ...this.snapshot().settings, onboarded: true }),
          );
          break;
        }
        default:
          throw new Error('Недоступная операция');
      }
    });
    return result as Commands[K]['output'];
  }
}
