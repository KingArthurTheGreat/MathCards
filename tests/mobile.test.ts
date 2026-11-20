import { expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Repository } from '../electron/database';
import { exportArchive, importArchive } from '../electron/backup';
import { createBackup, restoreBackup } from '../src/mobile/backup';
import { MobileRepository } from '../src/mobile/database';
import { imageIds } from '../shared/model';

it('round-trips photographs and review history between desktop and mobile ZIPs', async () => {
  const SQL = await initSqlJs();
  const mobile = new MobileRepository(new SQL.Database());
  const dir = mkdtempSync(join(tmpdir(), 'mathcards-mobile-'));
  const desktop = new Repository(dir);
  try {
    desktop.execute('demo', { action: 'install' });
    const card = desktop.snapshot().cards[0];
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=',
      'base64',
    );
    const src = desktop.addImage(png);
    desktop.execute('saveCard', {
      ...card,
      back: { type: 'doc', content: [{ type: 'image', attrs: { src } }] },
    });
    const sessionId = desktop.execute('startSession', { cardIds: [card.id] });
    desktop.execute('rateCard', { sessionId, cardId: card.id, rating: 'known' });
    expect(restoreBackup(mobile, exportArchive(desktop, []))).toBe(7);
    const copy = mobile.snapshot().cards.find((c) => c.lastRating === 'known')!;
    expect(Buffer.from(mobile.readImage(imageIds(copy.back)[0]))).toEqual(png);
    expect(importArchive(desktop, Buffer.from(createBackup(mobile, [])))).toBe(7);
    expect(desktop.snapshot().cards.filter((c) => c.schedule?.repetitions === 1)).toHaveLength(2);
  } finally {
    desktop.close();
    mobile.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
