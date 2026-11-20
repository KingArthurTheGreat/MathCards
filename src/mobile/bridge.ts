import type { Bridge, Commands } from '../../shared/model';
import { openRepository, type MobileRepository } from './database';
import { pickBackup, restoreBackup, createBackup, shareBackup } from './backup';

let repo: MobileRepository | undefined;
let queue: Promise<unknown> = Promise.resolve();
export function installMobileBridge() {
  window.mathcards = {
    imageUrl: (src) => repo?.imageUrl(src) ?? '',
    invoke<K extends keyof Commands>(key: K, input: Commands[K]['input']) {
      // Open the picker while the tap still has user activation.
      const picked = key === 'import' ? pickBackup() : undefined;
      const operation = queue.then(async () => {
        repo ??= await openRepository();
        if (key === 'snapshot') return repo.snapshot();
        if (key === 'export')
          return shareBackup(createBackup(repo, (input as Commands['export']['input']).deckIds));
        let result;
        if (picked) {
          const file = await picked;
          if (!file) return null;
          if (file.size > 256 * 1024 * 1024) throw new Error('Архив превышает 256 МБ');
          result = restoreBackup(repo, new Uint8Array(await file.arrayBuffer()));
        } else result = repo.execute(key, input);
        try {
          await repo.persist();
        } catch (error) {
          // Reload the last committed library after a failed IndexedDB transaction.
          repo.close();
          repo = undefined;
          throw error;
        }
        return result;
      });
      queue = operation.catch(() => {});
      return operation as Promise<Commands[K]['output']>;
    },
  } satisfies Bridge;
}
