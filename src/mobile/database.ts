import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { get, set } from 'idb-keyval';
import { LibraryRepository } from '../../shared/repository';
import { imageExtension } from '../../shared/image-format';

export function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export class MobileRepository extends LibraryRepository {
  private urls = new Map<string, string>();
  constructor(private db: Database) {
    super('Локальное хранилище MathCards', uuid);
    this.exec('PRAGMA foreign_keys=ON');
    this.migrate();
    this.exec(
      'CREATE TABLE IF NOT EXISTS image_data(id TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE, bytes BLOB NOT NULL)',
    );
    this.run(
      'DELETE FROM images WHERE createdAt < ? AND id NOT IN (SELECT imageId FROM card_images)',
      new Date(Date.now() - 86400000).toISOString(),
    );
  }
  exec(sql: string) {
    this.db.run(sql);
  }
  run(sql: string, ...params: (string | number | null)[]) {
    this.db.run(sql, params);
  }
  all(sql: string, ...params: (string | number)[]) {
    const statement = this.db.prepare(sql, params);
    try {
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }
  hasImage(id: string) {
    return this.all('SELECT id FROM image_data WHERE id=?', id).length > 0;
  }
  addImage(bytes: Uint8Array) {
    const id = uuid() + '.' + imageExtension(bytes);
    this.run('INSERT INTO images VALUES(?,?)', id, new Date().toISOString());
    this.db.run('INSERT INTO image_data VALUES(?,?)', [id, bytes]);
    return 'media://image/' + id;
  }
  readImage(id: string) {
    const bytes = this.all('SELECT bytes FROM image_data WHERE id=?', id)[0]?.bytes;
    if (!(bytes instanceof Uint8Array)) throw new Error('Изображение не найдено');
    return bytes;
  }
  imageUrl(src: string) {
    const id = src.replace('media://image/', '');
    let url = this.urls.get(id);
    if (!url) {
      const bytes = this.readImage(id);
      const ext = imageExtension(bytes);
      url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) }),
      );
      this.urls.set(id, url);
    }
    return url;
  }
  async persist() {
    const bytes = this.db.export();
    this.exec('PRAGMA foreign_keys=ON');
    await set('mathcards.sqlite', bytes);
  }
  close() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.db.close();
  }
}
export async function openRepository() {
  const [SQL, bytes] = await Promise.all([
    initSqlJs({ useOldExtensionFunctions: false, locateFile: () => wasmUrl }),
    get<Uint8Array>('mathcards.sqlite'),
  ]);
  return new MobileRepository(new SQL.Database(bytes));
}
