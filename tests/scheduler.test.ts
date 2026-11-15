import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repository } from '../electron/database';
import { exportArchive, importArchive } from '../electron/backup';
import { emptyDoc } from '../shared/model';
import { isDue, scheduleFromReviews, scheduleReview } from '../shared/scheduler';
import { resizedWidth } from '../shared/image-size';
let repo: Repository;
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'mathcards-srs-'));
  repo = new Repository(dir);
});
afterEach(() => {
  repo.close();
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});
it('uses SM-2 intervals 1, 6 and ceiling(previous interval × easiness)', () => {
  const a = scheduleReview(null, 'known', '2026-01-01T12:00:00.000Z');
  const b = scheduleReview(a, 'known', '2026-01-02T12:00:00.000Z');
  const c = scheduleReview(b, 'hard', '2026-01-08T12:00:00.000Z');
  expect([a.intervalDays, b.intervalDays, c.intervalDays]).toEqual([1, 6, 17]);
  expect(c.ease).toBe(2.56);
  expect(c.dueAt).toBe('2026-01-25T12:00:00.000Z');
  expect(isDue({ schedule: a }, Date.parse('2026-01-02T11:59:59.000Z'))).toBe(false);
  expect(isDue({ schedule: a }, Date.parse(a.dueAt))).toBe(true);
  expect(isDue({ schedule: null })).toBe(true);
});
it('resets a forgotten card and never drops easiness below 1.3', () => {
  let s = scheduleReview(null, 'known', '2026-01-01T12:00:00.000Z');
  for (let i = 0; i < 10; i++) s = scheduleReview(s, 'unknown', '2026-01-02T12:00:00.000Z');
  expect(s.ease).toBe(1.3);
  expect(s.repetitions).toBe(0);
  expect(s.intervalDays).toBe(1);
  expect(scheduleReview(s, 'known', '2026-01-03T12:00:00.000Z').intervalDays).toBe(1);
});
it('same-day drills and corrected ratings do not inflate intervals', () => {
  const events = [
    { rating: 'known' as const, reviewedAt: '2026-01-01T12:00:00.000Z' },
    { rating: 'unknown' as const, reviewedAt: '2026-01-02T12:00:00.000Z' },
    { rating: 'known' as const, reviewedAt: '2026-01-02T13:00:00.000Z' },
  ];
  const s = scheduleFromReviews(events)!;
  expect(s.repetitions).toBe(2);
  expect(s.intervalDays).toBe(6);
  expect(s.ease).toBe(2.7);
});
function card() {
  const deckId = repo.execute('saveDeck', { name: 'Пределы', description: '' });
  return repo.execute('saveCard', {
    deckId,
    title: 'Предел',
    type: 'Теорема',
    tags: [],
    front: emptyDoc(),
    back: emptyDoc(),
  });
}
it('migrates v1 with historical results, persists schedule, and restores it through ZIP', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  const id = card();
  const sessionId = repo.execute('startSession', { cardIds: [id] });
  repo.execute('rateCard', { sessionId, cardId: id, rating: 'known' });
  repo.execute('endSession', { id: sessionId });
  repo.db.exec('DROP TABLE review_state; PRAGMA user_version=1');
  repo.close();
  repo = new Repository(dir);
  const original = repo.snapshot().cards[0].schedule;
  expect(original?.intervalDays).toBe(1);
  expect(
    (repo.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
  ).toBe(2);
  const archive = exportArchive(repo, []);
  expect(importArchive(repo, archive)).toBe(1);
  expect(repo.snapshot().cards.map((c) => c.schedule)).toEqual([original, original]);
  repo.close();
  repo = new Repository(dir);
  expect(repo.snapshot().cards[0].schedule).toEqual(original);
  repo.execute('deleteCards', { ids: [id] });
  expect(repo.all('SELECT * FROM review_state')).toHaveLength(1);
});
it('re-rating one session recomputes rather than appending schedule history', () => {
  const cardId = card();
  const sessionId = repo.execute('startSession', { cardIds: [cardId] });
  repo.execute('rateCard', { sessionId, cardId, rating: 'unknown' });
  repo.execute('rateCard', { sessionId, cardId, rating: 'known' });
  expect(repo.snapshot().cards[0].schedule?.repetitions).toBe(1);
  expect(repo.snapshot().cards[0].reviewCount).toBe(1);
});
it('projects corner movement with preserved aspect ratio and clamps within the editor', () => {
  expect(resizedWidth(50, 400, 200, 80, 40)).toBe(60);
  expect(resizedWidth(50, 400, 200, -80, -40)).toBe(40);
  expect(resizedWidth(50, 400, 200, -1000, -500)).toBe(10);
  expect(resizedWidth(50, 400, 200, 1000, 500)).toBe(100);
});
