import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
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
} from '../shared/model';
import { schemas, mediaName } from '../shared/validation';
import { demoDecks } from './demo';
const now = () => new Date().toISOString();
type Row = Record<string, any>;
export class Repository {
  db: DatabaseSync;
  mediaDir: string;
  constructor(public directory: string) {
    mkdirSync(directory, { recursive: true });
    this.mediaDir = path.join(directory, 'images');
    mkdirSync(this.mediaDir, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'mathcards.sqlite'));
    this.db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;',
    );
    const version = Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version);
    if (version > 1)
      throw new Error('База создана более новой версией MathCards. Обновите приложение.');
    if (version === 0)
      this.db.exec(`BEGIN;
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
    this.cleanupImages(true);
  }
  all(sql: string, ...params: (string | number)[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  run(sql: string, ...params: (string | number | null)[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
  require(table: 'cards' | 'decks' | 'collections' | 'sessions', id: string) {
    if (!this.all(`SELECT id FROM ${table} WHERE id=?`, id).length)
      throw new Error('Запись не найдена. Обновите страницу.');
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
    const cards = this.all('SELECT * FROM cards ORDER BY createdAt,id').map((c) => {
      const r = reviews.filter((r) => r.cardId === c.id);
      return {
        ...c,
        front: JSON.parse(c.front),
        back: JSON.parse(c.back),
        tags: tags.filter((t) => t.cardId === c.id).map((t) => t.name),
        lastRating: r.at(-1)?.rating ?? null,
        reviewCount: r.length,
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
    const id = c.id ?? randomUUID();
    if (c.id) this.require('cards', id);
    const images = [...new Set([...imageIds(c.front), ...imageIds(c.back)])];
    for (const image of images)
      if (
        !this.all('SELECT id FROM images WHERE id=?', image).length ||
        !existsSync(path.join(this.mediaDir, image))
      )
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
      this.run('INSERT OR IGNORE INTO tags VALUES(?,?)', randomUUID(), tag);
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
    if (command === 'addImage') return this.addImage(Buffer.from(p.bytes)) as Commands[K]['output'];
    const result = this.transaction(() => {
      switch (command) {
        case 'saveDeck': {
          const id = p.id ?? randomUUID();
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
          const id = p.id ?? randomUUID();
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
          const id = randomUUID();
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
              const id = randomUUID();
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
  addImage(bytes: Buffer): string {
    const ext = imageExtension(bytes);
    const id = `${randomUUID()}.${ext}`;
    writeFileSync(path.join(this.mediaDir, id), bytes, { flag: 'wx' });
    try {
      this.run('INSERT INTO images VALUES(?,?)', id, now());
    } catch (err) {
      unlinkSync(path.join(this.mediaDir, id));
      throw err;
    }
    return `media://image/${id}`;
  }
  cleanupImages(startup = false) {
    // A grace period protects unsaved editor images. Cleanup is restricted to generated filenames.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const referenced = new Set(
      this.all('SELECT DISTINCT imageId FROM card_images').map((r) => r.imageId),
    );
    for (const file of readdirSync(this.mediaDir))
      if (
        mediaName.test(file) &&
        !referenced.has(file) &&
        statSync(path.join(this.mediaDir, file)).mtimeMs < cutoff
      ) {
        try {
          unlinkSync(path.join(this.mediaDir, file));
          this.run('DELETE FROM images WHERE id=?', file);
        } catch (err) {
          if (!startup) throw err;
        }
      }
    this.run('DELETE FROM tags WHERE id NOT IN (SELECT tagId FROM card_tags)');
  }
  readImage(id: string): Buffer {
    if (!mediaName.test(id) || !this.all('SELECT id FROM images WHERE id=?', id).length)
      throw new Error('Изображение не найдено');
    return readFileSync(path.join(this.mediaDir, id));
  }
  close() {
    this.db.close();
  }
}
export function imageExtension(b: Buffer): 'png' | 'jpg' | 'webp' {
  if (b.length < 12 || b.length > 20 * 1024 * 1024)
    throw new Error('Размер изображения: от 12 байт до 20 МБ');
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new Error('Поддерживаются только PNG, JPEG и WebP');
}
