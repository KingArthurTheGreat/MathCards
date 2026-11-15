import { app, BrowserWindow, dialog, ipcMain, protocol, net, session, Menu } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { Repository } from './database';
import { exportArchive, importArchive } from './backup';
import { schemas } from '../shared/validation';
import type { Commands } from '../shared/model';
app.setName('MathCards');
if (process.env.MATHCARDS_DATA_DIR && !app.isPackaged)
  app.setPath('userData', process.env.MATHCARDS_DATA_DIR);
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const dev = !app.isPackaged && process.env.MATHCARDS_DEV === '1';
let repo: Repository;
let win: BrowserWindow | null = null;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    win?.restore();
    win?.focus();
  });
  app
    .whenReady()
    .then(() => {
      repo = new Repository(app.getPath('userData'));
      protocol.handle('app', (request) => {
        const url = new URL(request.url);
        const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
        const root = path.resolve(__dirname, '../dist');
        const file = path.resolve(root, name);
        if (url.hostname !== 'bundle' || !file.startsWith(root + path.sep))
          return new Response('Запрещено', { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
      });
      protocol.handle('media', (request) => {
        try {
          const u = new URL(request.url);
          if (u.hostname !== 'image') throw new Error();
          const id = decodeURIComponent(u.pathname.slice(1));
          const data = repo.readImage(id);
          return new Response(new Uint8Array(data), {
            headers: {
              'Content-Type': id.endsWith('.png')
                ? 'image/png'
                : id.endsWith('.webp')
                  ? 'image/webp'
                  : 'image/jpeg',
              'Cache-Control': 'no-store',
            },
          });
        } catch {
          return new Response('Не найдено', { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              `default-src 'self'; script-src 'self' ${dev ? "'nonce-mathcards-dev'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' media:; font-src 'self'; connect-src 'self' ${dev ? 'ws://127.0.0.1:5173' : ''}; object-src 'none'; base-uri 'none'; frame-src 'none'`,
            ],
          },
        }),
      );
      ipcMain.handle('mathcards', async (event, command: string, payload: unknown) => {
        try {
          const url = event.senderFrame?.url ?? '';
          if (
            event.sender !== win?.webContents ||
            event.senderFrame !== event.sender.mainFrame ||
            !(dev
              ? new URL(url).origin === 'http://127.0.0.1:5173'
              : url.startsWith('app://bundle/'))
          )
            throw new Error('Источник запроса запрещён');
          if (!Object.hasOwn(schemas, command)) throw new Error('Недоступная операция');
          const key = command as keyof Commands;
          const parsed = schemas[key].parse(payload);
          let value: unknown;
          if (key === 'export') {
            const result = await dialog.showSaveDialog(win!, {
              title: 'Экспорт MathCards',
              defaultPath: `MathCards-${new Date().toISOString().slice(0, 10)}.zip`,
              filters: [{ name: 'Архив MathCards', extensions: ['zip'] }],
            });
            if (result.canceled || !result.filePath) value = false;
            else {
              const bytes = exportArchive(repo, (parsed as { deckIds: string[] }).deckIds);
              const temp = result.filePath + '.tmp';
              writeFileSync(temp, bytes);
              renameSync(temp, result.filePath);
              value = true;
            }
          } else if (key === 'import') {
            const result = await dialog.showOpenDialog(win!, {
              title: 'Импорт MathCards',
              properties: ['openFile'],
              filters: [{ name: 'Архив MathCards', extensions: ['zip'] }],
            });
            if (result.canceled || !result.filePaths[0]) value = null;
            else {
              if (statSync(result.filePaths[0]).size > 256 * 1024 * 1024)
                throw new Error('Архив превышает 256 МБ');
              value = importArchive(repo, readFileSync(result.filePaths[0]));
            }
          } else value = repo.execute(key, parsed as never);
          return { ok: true, value };
        } catch (error) {
          console.error(error);
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.name === 'ZodError'
                  ? 'Проверьте заполнение полей и формат данных.'
                  : error.message
                : 'Не удалось выполнить операцию',
          };
        }
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: 'MathCards',
            submenu: [
              { role: 'about', label: 'О MathCards' },
              { type: 'separator' },
              { role: 'quit', label: 'Выйти' },
            ],
          },
          {
            label: 'Правка',
            submenu: [
              { role: 'undo', label: 'Отменить' },
              { role: 'redo', label: 'Повторить' },
              { type: 'separator' },
              { role: 'cut', label: 'Вырезать' },
              { role: 'copy', label: 'Копировать' },
              { role: 'paste', label: 'Вставить' },
              { role: 'selectAll', label: 'Выделить всё' },
            ],
          },
          {
            label: 'Вид',
            submenu: [
              { role: 'togglefullscreen', label: 'Полный экран' },
              { role: 'resetZoom', label: 'Исходный масштаб' },
              { role: 'zoomIn', label: 'Увеличить' },
              { role: 'zoomOut', label: 'Уменьшить' },
            ],
          },
        ]),
      );
      const createWindow = () => {
        win = new BrowserWindow({
          width: 1440,
          height: 960,
          minWidth: 980,
          minHeight: 700,
          backgroundColor: '#f6f7fb',
          title: 'MathCards',
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
          },
        });
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', (e, url) => {
          if (url !== (dev ? 'http://127.0.0.1:5173/' : 'app://bundle/index.html'))
            e.preventDefault();
        });
        win.webContents.on('will-attach-webview', (e) => e.preventDefault());
        win.webContents.on('will-prevent-unload', (event) => {
          const choice = dialog.showMessageBoxSync(win!, {
            type: 'question',
            buttons: ['Продолжить редактирование', 'Выйти без сохранения'],
            defaultId: 0,
            cancelId: 0,
            title: 'Несохранённая карточка',
            message: 'В карточке есть несохранённые изменения.',
          });
          if (choice === 1) event.preventDefault();
        });
        win.on('closed', () => {
          win = null;
        });
        void win.loadURL(dev ? 'http://127.0.0.1:5173/' : 'app://bundle/index.html');
      };
      createWindow();
      app.on('activate', () => {
        if (!win) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox('MathCards не удалось запустить', String(error));
      app.quit();
    });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => repo?.close());
}
