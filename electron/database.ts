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
import { LibraryRepository } from '../shared/repository';
import { mediaName } from '../shared/validation';
import { imageExtension } from '../shared/image-format';
type Row = Record<string, any>;
export class Repository extends LibraryRepository {
  db: DatabaseSync;
  mediaDir: string;
  constructor(directory: string) {
    super(directory, randomUUID);
    mkdirSync(directory, { recursive: true });
    this.mediaDir = path.join(directory, 'images');
    mkdirSync(this.mediaDir, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'mathcards.sqlite'));
    this.db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;',
    );
    this.migrate();
    this.cleanupImages(true);
  }
  all(sql: string, ...params: (string | number)[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  run(sql: string, ...params: (string | number | null)[]) {
    return this.db.prepare(sql).run(...params);
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
  hasImage(id: string) {
    return existsSync(path.join(this.mediaDir, id));
  }
  addImage(bytes: Uint8Array): string {
    const ext = imageExtension(bytes);
    const id = `${randomUUID()}.${ext}`;
    writeFileSync(path.join(this.mediaDir, id), bytes, { flag: 'wx' });
    try {
      this.run('INSERT INTO images VALUES(?,?)', id, new Date().toISOString());
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
