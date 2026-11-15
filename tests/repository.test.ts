import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { Repository } from '../electron/database';
import { exportArchive, importArchive } from '../electron/backup';
import { emptyDoc, type CardInput } from '../shared/model';
import { selectRange, shuffle, repeatIds } from '../shared/study';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=',
  'base64',
);
let repo: Repository;
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'mathcards-test-'));
  repo = new Repository(directory);
});
afterEach(() => {
  repo.close();
  rmSync(directory, { recursive: true, force: true });
});
function deck() {
  return repo.execute('saveDeck', { name: 'Экзамен по матану', description: '' });
}
function input(deckId = deck()): CardInput {
  return {
    title: 'Теорема Вейерштрасса',
    type: 'Теорема',
    deckId,
    front: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Теорема Вейерштрасса' }] }],
    },
    back: {
      type: 'doc',
      content: [{ type: 'blockMath', attrs: { latex: String.raw`\int_a^b f(x)\,dx` } }],
    },
    tags: ['Экзамен', 'Билет 12'],
  };
}
describe('SQLite and study lifecycle', () => {
  it('creates, updates and persists a card and copied photo after restart', () => {
    const c = input();
    const src = repo.execute('addImage', { bytes: [...png] });
    c.back = { type: 'doc', content: [{ type: 'image', attrs: { src, width: 50 } }] };
    const id = repo.execute('saveCard', c);
    repo.execute('saveCard', { ...c, id, title: 'Изменено' });
    repo.close();
    repo = new Repository(directory);
    const saved = repo.snapshot().cards[0];
    expect(saved.id).toBe(id);
    expect(saved.title).toBe('Изменено');
    expect(saved.back).toEqual(c.back);
    expect(saved.tags).toEqual(['Билет 12', 'Экзамен']);
    expect(repo.readImage(src.replace('media://image/', ''))).toEqual(png);
  });
  it('studies exactly three of ten and persists ratings without double counting', () => {
    const d = deck();
    const ids = Array.from({ length: 10 }, (_, i) =>
      repo.execute('saveCard', { ...input(d), title: `Теорема ${i}` }),
    );
    const selected = [ids[1], ids[4], ids[8]];
    const sessionId = repo.execute('startSession', { cardIds: selected });
    repo.execute('rateCard', { sessionId, cardId: ids[1], rating: 'known' });
    repo.execute('rateCard', { sessionId, cardId: ids[4], rating: 'hard' });
    repo.execute('rateCard', { sessionId, cardId: ids[8], rating: 'unknown' });
    repo.execute('rateCard', { sessionId, cardId: ids[1], rating: 'known' });
    expect(() =>
      repo.execute('rateCard', { sessionId, cardId: ids[0], rating: 'known' }),
    ).toThrow();
    repo.execute('endSession', { id: sessionId });
    const session = repo.snapshot().sessions[0];
    expect(session.cardIds).toEqual(selected);
    expect(session.results).toHaveLength(3);
    expect(repeatIds(session, ['unknown'])).toEqual([ids[8]]);
    expect(() => repo.execute('rateCard', { sessionId, cardId: ids[1], rating: 'hard' })).toThrow();
    repo.close();
    repo = new Repository(directory);
    expect(repo.snapshot().sessions[0].results).toHaveLength(3);
  });
  it('collections refer to original cards, duplicate and move retain relationships', () => {
    const c = input();
    const id = repo.execute('saveCard', c);
    repo.execute('saveCollection', { name: 'Билеты 1–5', cardIds: [id, id] });
    repo.execute('saveCard', { ...c, id, title: 'Новое название' });
    expect(repo.snapshot().collections[0].cardIds).toEqual([id]);
    expect(repo.snapshot().cards[0].title).toBe('Новое название');
    const duplicate = repo.execute('duplicateCard', { id });
    expect(duplicate).not.toBe(id);
    const target = deck();
    repo.execute('moveCards', { ids: [id], deckId: target });
    expect(repo.snapshot().cards.find((c) => c.id === id)?.deckId).toBe(target);
    repo.execute('deleteDeck', { id: target });
    expect(repo.snapshot().collections[0].cardIds).toEqual([]);
    expect(repo.snapshot().cards).toHaveLength(1);
  });
  it('rolls back mutations and rejects invalid data', () => {
    const d = deck();
    const id = repo.execute('saveCard', input(d));
    expect(() => repo.execute('moveCards', { ids: [id, randomUUID()], deckId: deck() })).toThrow();
    expect(repo.snapshot().cards[0].deckId).toBe(d);
    expect(() => repo.execute('saveCard', { ...input(d), title: '' })).toThrow();
    expect(() =>
      repo.execute('saveCard', {
        ...input(d),
        front: { type: 'doc', content: [{ type: 'image', attrs: { src: 'file:///etc/passwd' } }] },
      }),
    ).toThrow();
    expect(() =>
      repo.execute('addImage', { bytes: [...Buffer.from('<svg onload="alert(1)"></svg>')] }),
    ).toThrow();
  });
  it('preserves shared images and expires only unreferenced images after 24 hours', () => {
    const c = input();
    const src = repo.execute('addImage', { bytes: [...png] });
    c.back = { type: 'doc', content: [{ type: 'image', attrs: { src } }] };
    const first = repo.execute('saveCard', c);
    const second = repo.execute('duplicateCard', { id: first });
    const file = path.join(repo.mediaDir, src.replace('media://image/', ''));
    utimesSync(file, new Date(0), new Date(0));
    repo.execute('deleteCards', { ids: [first] });
    repo.cleanupImages();
    expect(existsSync(file)).toBe(true);
    repo.execute('deleteCards', { ids: [second] });
    repo.cleanupImages();
    expect(existsSync(file)).toBe(false);
  });
  it('installs demos only on request and removes them separately', () => {
    expect(repo.snapshot().cards).toHaveLength(0);
    repo.execute('saveCard', input());
    repo.execute('demo', { action: 'install' });
    repo.execute('demo', { action: 'install' });
    expect(repo.snapshot().cards).toHaveLength(8);
    repo.execute('demo', { action: 'remove' });
    expect(repo.snapshot().cards).toHaveLength(1);
  });
});
describe('backup integrity', () => {
  function populated() {
    const c = input();
    const src = repo.execute('addImage', { bytes: [...png] });
    c.back.content!.push({ type: 'image', attrs: { src, width: 75 } });
    const cardId = repo.execute('saveCard', c);
    repo.execute('saveCollection', { name: 'Сложные теоремы', cardIds: [cardId] });
    const sessionId = repo.execute('startSession', { cardIds: [cardId] });
    repo.execute('rateCard', { sessionId, cardId, rating: 'unknown' });
    return { cardId, src };
  }
  it('round trips formatting, formula, media, tags, collections and history while resolving collisions', () => {
    const { cardId } = populated();
    const archive = exportArchive(repo, []);
    expect(importArchive(repo, archive)).toBe(1);
    const s = repo.snapshot();
    expect(s.cards).toHaveLength(2);
    const copy = s.cards.find((c) => c.id !== cardId)!;
    expect(copy.deckId).not.toBe(s.cards.find((c) => c.id === cardId)!.deckId);
    expect(copy.back.content?.[0].attrs?.latex).toBe(String.raw`\int_a^b f(x)\,dx`);
    expect(copy.tags).toEqual(['Билет 12', 'Экзамен']);
    const src = String(copy.back.content?.[1].attrs?.src);
    expect(repo.readImage(src.replace('media://image/', ''))).toEqual(png);
    expect(s.collections.some((c) => c.cardIds[0] === copy.id)).toBe(true);
    expect(s.sessions.some((s) => s.results[0]?.cardId === copy.id)).toBe(true);
  });
  it('imports into a separate database and does not export unrelated decks', () => {
    populated();
    const extra = deck();
    repo.execute('saveCard', input(extra));
    const zip = exportArchive(repo, [extra]);
    const dir = mkdtempSync(path.join(tmpdir(), 'mathcards-other-'));
    const other = new Repository(dir);
    try {
      expect(importArchive(other, zip)).toBe(1);
      expect(other.snapshot().decks).toHaveLength(1);
    } finally {
      other.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('rejects checksum corruption atomically', () => {
    populated();
    const zip = new AdmZip(exportArchive(repo, []));
    const image = zip.getEntries().find((e) => e.entryName.startsWith('images/'))!;
    zip.updateFile(image.entryName, Buffer.from('corrupt'));
    expect(() => importArchive(repo, zip.toBuffer())).toThrow();
    expect(repo.snapshot().cards).toHaveLength(1);
  });
  it('rejects unknown ZIP paths, missing references and invalid manifest versions', () => {
    populated();
    const bytes = exportArchive(repo, []);
    const zip = new AdmZip(bytes);
    zip.addFile('evil.txt', Buffer.from('evil'));
    expect(() => importArchive(repo, zip.toBuffer())).toThrow('путь');
    const zip2 = new AdmZip(bytes);
    const manifest = JSON.parse(zip2.readAsText('manifest.json'));
    manifest.cards[0].deckId = randomUUID();
    zip2.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    expect(() => importArchive(repo, zip2.toBuffer())).toThrow('отсутствует');
    manifest.version = 999;
    zip2.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    expect(() => importArchive(repo, zip2.toBuffer())).toThrow();
    expect(repo.snapshot().cards).toHaveLength(1);
  });
  it('refuses oversized ZIP metadata before decompression', () => {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from('{}'));
    const bytes = zip.toBuffer();
    const offset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(100 * 1024 * 1024, offset + 24);
    expect(() => importArchive(repo, bytes)).toThrow('велик');
  });
});
describe('selection', () => {
  it('selects forward and reverse ranges and preserves source when shuffled', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(selectRange(items, 2, 0)).toEqual(['a', 'b', 'c']);
    expect(selectRange(items, 1, 2)).toEqual(['b', 'c']);
    const shuffled = shuffle(items, () => 0);
    expect(shuffled).toHaveLength(items.length);
    expect(new Set(shuffled)).toEqual(new Set(items));
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
