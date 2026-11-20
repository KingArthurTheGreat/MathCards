import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { manifestSchema, mergeManifest, selectDecks } from '../../shared/archive';
import { imageIds } from '../../shared/model';
import { imageExtension } from '../../shared/image-format';
import { MobileRepository, uuid } from './database';

const MB = 1024 * 1024;
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
export function createBackup(repo: MobileRepository, deckIds: string[]) {
  const selection = selectDecks(repo.snapshot(), deckIds);
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  const images = Array.from(
    new Set(selection.cards.flatMap((c) => [...imageIds(c.front), ...imageIds(c.back)])),
    (id) => {
      const bytes = repo.readImage(id);
      total += bytes.length;
      if (total > 512 * MB) throw new Error('Экспортируйте наборы по отдельности');
      files['images/' + id] = bytes;
      return { id, sha256: hash(bytes) };
    },
  );
  const manifest = manifestSchema.parse({ format: 'mathcards', version: 1, ...selection, images });
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  if (files['manifest.json'].length > 64 * MB || total + files['manifest.json'].length > 512 * MB)
    throw new Error('Экспортируйте наборы по отдельности');
  const zip = zipSync(files, { level: 1 });
  if (zip.length > 256 * MB) throw new Error('Архив превышает 256 МБ');
  return zip;
}

export async function shareBackup(zip: Uint8Array) {
  const path = 'MathCards-' + uuid() + '.zip';
  // Stream base64 chunks across the native bridge. Each non-final chunk is divisible by three.
  const size = 3 * 8192;
  let uri = '';
  for (let i = 0; i < zip.length; i += size) {
    const options = {
      path,
      directory: Directory.Cache,
      data: btoa(String.fromCharCode(...zip.subarray(i, i + size))),
    };
    if (i === 0) uri = (await Filesystem.writeFile(options)).uri;
    else await Filesystem.appendFile(options);
  }
  await Share.share({ title: 'MathCards', files: [uri] });
  return true;
}

export function pickBackup(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
export function restoreBackup(repo: MobileRepository, zip: Uint8Array) {
  if (zip.length > 256 * MB) throw new Error('Архив превышает 256 МБ');
  const names = new Set<string>();
  let total = 0;
  const files = unzipSync(zip, {
    filter(entry) {
      const manifest = entry.name === 'manifest.json';
      total += entry.originalSize;
      if (
        names.has(entry.name) ||
        names.size >= 20001 ||
        (!manifest && !/^images\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(entry.name)) ||
        entry.originalSize > (manifest ? 64 : 20) * MB ||
        total > 512 * MB
      )
        throw new Error('Недопустимое содержимое ZIP');
      names.add(entry.name);
      return true;
    },
  });
  if (!files['manifest.json']) throw new Error('В архиве отсутствует manifest.json');
  const m = manifestSchema.parse(JSON.parse(strFromU8(files['manifest.json'])));
  if (names.size !== m.images.length + 1) throw new Error('Лишние файлы в архиве');
  return repo.transaction(() => {
    const imageMap = new Map<string, string>();
    for (const image of m.images) {
      const bytes = files['images/' + image.id];
      if (!bytes || hash(bytes) !== image.sha256 || !image.id.endsWith('.' + imageExtension(bytes)))
        throw new Error('Повреждённое изображение');
      imageMap.set(image.id, repo.addImage(bytes).replace('media://image/', ''));
    }
    return mergeManifest(repo, m, imageMap, uuid);
  });
}
