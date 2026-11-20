import { z } from 'zod';
import { cardSchema, id, ids, mediaName, settingsSchema } from './validation';
import { imageIds, type Doc } from './model';
import type { LibraryRepository } from './repository';
import type { Snapshot } from './model';
export const manifestSchema = z.object({
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
export function selectDecks(s: Snapshot, deckIds: string[]) {
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
  return { decks, cards, collections, sessions, settings: s.settings };
}
export function mergeManifest(
  repo: LibraryRepository,
  m: z.infer<typeof manifestSchema>,
  imageMap: Map<string, string>,
  randomUUID: () => string,
) {
  function unique(values: string[]) {
    if (new Set(values).size !== values.length)
      throw new Error('Повторяющиеся идентификаторы в архиве');
  }
  for (const list of [m.decks, m.cards, m.collections, m.images, m.sessions])
    unique(list.map((v) => v.id));
  const deckMap = new Map(m.decks.map((d) => [d.id, randomUUID()]));
  const cardMap = new Map<string, string>(m.cards.map((c) => [c.id, randomUUID()]));
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
  return m.cards.length;
}
