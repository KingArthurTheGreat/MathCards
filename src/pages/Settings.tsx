import { useState } from 'react';
import { Download, Upload, Monitor, Moon, Sun, ShieldCheck, BookOpen } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { Confirm } from '../components/Modal';
export function Settings() {
  const { data, call, task, notify } = useStore();
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  function backup(action: 'import' | 'export') {
    void task(async () => {
      setBusy(true);
      try {
        if (action === 'export') {
          if (await call('export', { deckIds: [] })) notify('Резервная копия сохранена');
        } else {
          const count = await call('import', undefined);
          if (count !== null) notify(`Импортировано карточек: ${count}`);
        }
      } finally {
        setBusy(false);
      }
    });
  }
  return (
    <main className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>Настройки</h1>
          <p>Ваше пространство — по вашим правилам.</p>
        </div>
      </div>
      <section className="panel settings-section">
        <h2>Оформление</h2>
        <p>Выберите тему, в которой комфортно заниматься.</p>
        <div className="theme-options">
          {(
            [
              { key: 'light', title: 'Светлая', icon: Sun },
              { key: 'dark', title: 'Тёмная', icon: Moon },
              { key: 'system', title: 'Системная', icon: Monitor },
            ] as const
          ).map(({ key, title, icon: Icon }) => (
            <button
              key={key}
              className={data.settings.theme === key ? 'active' : ''}
              onClick={() =>
                void task(async () => {
                  await call('settings', { ...data.settings, theme: key });
                })
              }
            >
              <Icon size={24} />
              {title}
            </button>
          ))}
        </div>
      </section>
      <section className="panel settings-section">
        <h2>Резервные копии</h2>
        <p>Наборы, карточки, формулы, фотографии, подборки и история — в одном ZIP-файле.</p>
        <div className="actions">
          <button disabled={busy} className="primary" onClick={() => backup('export')}>
            <Download size={18} />
            Экспортировать всё
          </button>
          <button disabled={busy} onClick={() => backup('import')}>
            <Upload size={18} />
            Импортировать архив
          </button>
        </div>
        <p className="small muted">
          Импорт добавляет отдельные копии наборов. Существующие карточки и настройки не меняются.
          Максимальный размер ZIP — 256 МБ.
        </p>
      </section>
      <section className="panel settings-section">
        <h2>Учебные примеры</h2>
        <p>
          Семь карточек о пределах и непрерывности с формулировками и краткими доказательствами.
        </p>
        <div className="actions">
          <button
            disabled={data.decks.some((d) => d.demo)}
            onClick={() =>
              void task(async () => {
                await call('demo', { action: 'install' });
                notify('Примеры добавлены');
              })
            }
          >
            <BookOpen size={18} />
            Добавить примеры
          </button>
          <button disabled={!data.decks.some((d) => d.demo)} onClick={() => setRemove(true)}>
            Удалить наборы с примерами
          </button>
        </div>
        <p className="small muted">
          Изменения внутри демонстрационных наборов тоже будут удалены. Переместите нужные карточки
          в свой набор.
        </p>
      </section>
      <section className="panel settings-section">
        <h2>
          <ShieldCheck size={20} /> Всё остаётся на вашем компьютере
        </h2>
        <p>MathCards 1.1.0 · Регистрация и подключение к интернету не нужны.</p>
        <label>
          Каталог данных<code className="data-path">{data.dataPath}</code>
        </label>
        <p className="small muted">
          База mathcards.sqlite и папка images. Для переноса используйте ZIP-экспорт. Обновление
          приложения не удаляет данные.
        </p>
      </section>
      {remove && (
        <Confirm
          title="Удалить демонстрационные наборы?"
          text="Будут удалены все карточки, находящиеся в наборах с примерами, включая добавленные вами. Другие наборы останутся."
          onClose={() => setRemove(false)}
          onConfirm={() =>
            task(async () => {
              await call('demo', { action: 'remove' });
              setRemove(false);
            })
          }
        />
      )}
    </main>
  );
}
