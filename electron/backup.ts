import AdmZip from 'adm-zip';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { selectDecks, manifestSchema, mergeManifest } from '../shared/archive';
import { imageIds } from '../shared/model';
import { Repository } from './database';
import { imageExtension } from '../shared/image-format';
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export function exportArchive(repo: Repository, deckIds: string[]): Buffer {
  const selection = selectDecks(repo.snapshot(), deckIds);
  const { cards } = selection;
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
    ...selection,
    images,
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
  const written: string[] = [];
  try {
    repo.transaction(() => {
      for (const i of imageData) {
        const file = path.join(repo.mediaDir, i.id);
        writeFileSync(file, i.bytes, { flag: 'wx' });
        written.push(file);
        repo.run('INSERT INTO images VALUES(?,?)', i.id, new Date().toISOString());
      }
      mergeManifest(repo, m, imageMap, randomUUID);
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
