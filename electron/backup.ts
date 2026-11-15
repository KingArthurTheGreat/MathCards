import AdmZip from 'adm-zip';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { cardSchema, id, ids, mediaName, settingsSchema } from '../shared/validation';
import { imageIds, type Doc } from '../shared/model';
import { Repository, imageExtension } from './database';
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const manifestSchema = z.object({
  format: z.literal('mathcards'),
  version: z.literal(1),
  decks: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(300),
        description: z.string().max(3000),
        demo: z.boolean(),
        createdAt: z.string().datetime(),
      }),
    )
    .max(10000),
  cards: z
    .array(
      cardSchema.extend({ id, createdAt: z.string().datetime(), updatedAt: z.string().datetime() }),
    )
    .max(20000),
  collections: z
    .array(z.object({ id, name: z.string().trim().min(1).max(300), cardIds: ids }))
    .max(10000),
  images: z
    .array(
      z.object({ id: z.string().regex(mediaName), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    )
    .max(20000),
  sessions: z
    .array(
      z.object({
        id,
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime().nullable(),
        cardIds: ids,
        results: z
          .array(
            z.object({
              cardId: id,
              rating: z.enum(['known', 'hard', 'unknown']),
              reviewedAt: z.string().datetime(),
            }),
          )
          .max(20000),
      }),
    )
    .max(50000),
  settings: settingsSchema,
});
export function exportArchive(repo: Repository, deckIds: string[]): Buffer {
  const s = repo.snapshot();
  const decks = s.decks.filter((d) => deckIds.length === 0 || deckIds.includes(d.id));
  const cards = s.cards.filter((c) => decks.some((d) => d.id === c.deckId));
  const cardSet = new Set(cards.map((c) => c.id));
  const collections = s.collections
    .map((c) => ({ ...c, cardIds: c.cardIds.filter((id) => cardSet.has(id)) }))
    .filter((c) => c.cardIds.length);
  const sessions = s.sessions
    .map((s) => ({
      ...s,
      cardIds: s.cardIds.filter((id) => cardSet.has(id)),
      results: s.results.filter((r) => cardSet.has(r.cardId)),
    }))
    .filter((s) => s.cardIds.length);
  const zip = new AdmZip();
  const images = [
    ...new Set(cards.flatMap((c) => [...imageIds(c.front), ...imageIds(c.back)])),
  ].map((id) => {
    const bytes = repo.readImage(id);
    zip.addFile(`images/${id}`, bytes);
    return { id, sha256: hash(bytes) };
  });
  const manifest = manifestSchema.parse({
    format: 'mathcards',
    version: 1,
    decks,
    cards,
    collections,
    images,
    sessions,
    settings: s.settings,
  });
  const json = Buffer.from(JSON.stringify(manifest));
  if (
    json.length > 64 * 1024 * 1024 ||
    zip.getEntries().reduce((sum, e) => sum + e.header.size, json.length) > 512 * 1024 * 1024
  )
    throw new Error('Библиотека слишком велика для одного архива. Экспортируйте наборы отдельно.');
  zip.addFile('manifest.json', json);
  const archive = zip.toBuffer();
  if (archive.length > 256 * 1024 * 1024)
    throw new Error('Архив превышает 256 МБ. Экспортируйте наборы отдельно.');
  return archive;
}
export function importArchive(repo: Repository, archive: Buffer): number {
  if (archive.length > 256 * 1024 * 1024) throw new Error('Архив превышает 256 МБ');
  const zip = new AdmZip(archive);
  const entries = zip.getEntries();
  if (entries.length > 20001) throw new Error('Слишком много файлов в архиве');
  const names = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    if (
      names.has(entry.entryName) ||
      (entry.entryName !== 'manifest.json' &&
        !/^images\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(entry.entryName))
    )
      throw new Error('Небезопасный или неизвестный путь внутри ZIP');
    names.add(entry.entryName);
    total += entry.header.size;
    if (
      entry.header.size > (entry.entryName === 'manifest.json' ? 64 : 20) * 1024 * 1024 ||
      total > 512 * 1024 * 1024
    )
      throw new Error('Распакованный архив слишком велик');
  }
  const manifest = zip.getEntry('manifest.json');
  if (!manifest) throw new Error('В архиве отсутствует manifest.json');
  const m = manifestSchema.parse(JSON.parse(manifest.getData().toString('utf8')));
  function unique(values: string[]) {
    if (new Set(values).size !== values.length)
      throw new Error('Повторяющиеся идентификаторы в архиве');
  }
  for (const list of [m.decks, m.cards, m.collections, m.images, m.sessions])
    unique(list.map((v) => v.id));
  const deckMap = new Map(m.decks.map((d) => [d.id, randomUUID()]));
  const cardMap = new Map<string, string>(m.cards.map((c) => [c.id, randomUUID()]));
  const imageMap = new Map<string, string>();
  const imageData = m.images.map((i) => {
    const e = zip.getEntry(`images/${i.id}`);
    if (!e) throw new Error('Изображение отсутствует в архиве');
    const bytes = e.getData();
    if (hash(bytes) !== i.sha256) throw new Error('Контрольная сумма изображения не совпадает');
    const ext = imageExtension(bytes);
    if (!i.id.endsWith(`.${ext}`)) throw new Error('Формат изображения не совпадает');
    const newId = `${randomUUID()}.${ext}`;
    imageMap.set(i.id, newId);
    return { id: newId, bytes };
  });
  if (names.size !== m.images.length + 1) throw new Error('В архиве есть файлы вне манифеста');
  for (const c of m.cards) {
    if (!deckMap.has(c.deckId)) throw new Error('Набор карточки отсутствует');
    for (const id of [...imageIds(c.front), ...imageIds(c.back)])
      if (!imageMap.has(id)) throw new Error('Ссылка на отсутствующее изображение');
  }
  for (const c of [...m.collections, ...m.sessions]) {
    unique(c.cardIds);
    for (const id of c.cardIds)
      if (!cardMap.has(id)) throw new Error('Ссылка на отсутствующую карточку');
  }
  for (const s of m.sessions) {
    unique(s.results.map((r) => r.cardId));
    if (s.results.some((r) => !s.cardIds.includes(r.cardId)))
      throw new Error('Результат не принадлежит сессии');
  }
  const rewrite = (doc: Doc): Doc => ({
    ...doc,
    ...(doc.type === 'image'
      ? {
          attrs: {
            ...doc.attrs,
            src: `media://image/${imageMap.get(String(doc.attrs?.src).replace('media://image/', ''))}`,
          },
        }
      : {}),
    ...(doc.content ? { content: doc.content.map(rewrite) } : {}),
  });
  const written: string[] = [];
  try {
    repo.transaction(() => {
      for (const i of imageData) {
        const file = path.join(repo.mediaDir, i.id);
        writeFileSync(file, i.bytes, { flag: 'wx' });
        written.push(file);
        repo.run('INSERT INTO images VALUES(?,?)', i.id, new Date().toISOString());
      }
      for (const d of m.decks)
        repo.run(
          'INSERT INTO decks VALUES(?,?,?,0,?,NULL)',
          deckMap.get(d.id)!,
          d.name,
          d.description,
          d.createdAt,
        );
      for (const c of m.cards) {
        const newId = repo.saveCard({
          ...c,
          id: undefined,
          deckId: deckMap.get(c.deckId)!,
          front: rewrite(c.front),
          back: rewrite(c.back),
        });
        cardMap.set(c.id, newId);
        repo.run(
          'UPDATE cards SET createdAt=?,updatedAt=? WHERE id=?',
          c.createdAt,
          c.updatedAt,
          newId,
        );
      }
      for (const c of m.collections) {
        const newId = randomUUID();
        repo.run('INSERT INTO collections VALUES(?,?)', newId, c.name);
        c.cardIds.forEach((id, i) =>
          repo.run('INSERT INTO collection_cards VALUES(?,?,?)', newId, cardMap.get(id)!, i),
        );
      }
      for (const s of m.sessions) {
        const newId = randomUUID();
        repo.run('INSERT INTO sessions VALUES(?,?,?)', newId, s.startedAt, s.endedAt);
        s.cardIds.forEach((id, i) =>
          repo.run('INSERT INTO session_cards VALUES(?,?,?)', newId, cardMap.get(id)!, i),
        );
        for (const r of s.results)
          repo.run(
            'INSERT INTO results VALUES(?,?,?,?)',
            newId,
            cardMap.get(r.cardId)!,
            r.rating,
            r.reviewedAt,
          );
      }
      for (const id of cardMap.values()) repo.rebuildSchedule(id);
      // Keep local preferences when merging another person's deck.
    });
  } catch (err) {
    for (const file of written)
      try {
        unlinkSync(file);
      } catch {
        /* startup cleanup handles an interrupted rollback */
      }
    throw err;
  }
  return m.cards.length;
}
