import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Commands, Snapshot } from '../../shared/model';
import { Modal } from '../components/Modal';
interface Store {
  data: Snapshot;
  refresh: () => Promise<void>;
  call: <K extends keyof Commands>(
    key: K,
    input: Commands[K]['input'],
  ) => Promise<Commands[K]['output']>;
  task: (fn: () => Promise<void>) => Promise<void>;
  notify: (s: string) => void;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(
    async () => setData(await window.mathcards.invoke('snapshot', undefined)),
    [],
  );
  const task = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    if (window.mathcards) void task(refresh);
    else
      setError(
        'Откройте приложение командой npm run dev. Для доступа к SQLite требуется Electron.',
      );
  }, [refresh, task]);
  useEffect(() => {
    if (!window.mathcards) return;
    const timer = setInterval(() => void task(refresh), 60_000);
    return () => clearInterval(timer);
  }, [refresh, task]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        data?.settings.theme === 'dark' || (data?.settings.theme === 'system' && query.matches),
      );
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [data?.settings.theme]);
  async function call<K extends keyof Commands>(key: K, input: Commands[K]['input']) {
    const result = await window.mathcards.invoke(key, input);
    await refresh();
    return result;
  }
  return (
    <>
      {data ? (
        <Context.Provider value={{ data, refresh, call, task, notify: setNotice }}>
          {children}
        </Context.Provider>
      ) : (
        <div className="loading">
          <span className="logo">∫</span>
          <h1>MathCards</h1>
          <p>Открываем ваше пространство…</p>
        </div>
      )}
      {error && (
        <Modal title="Не удалось выполнить действие" onClose={() => setError('')}>
          <p role="alert">{error}</p>
          <div className="modal-actions">
            <button className="primary" onClick={() => setError('')}>
              Понятно
            </button>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider required');
  return store;
}
