import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir = await mkdtemp(path.join(os.tmpdir(), 'mathcards-e2e-'));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAABAklEQVR4nO3RwQkAIBDAsNt/UF8O4NMpRCiBDFDorH0Im+8FPGVwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxBscZHGdwnMFxF6wDWzOfC8DvAAAAAElFTkSuQmCC',
  'base64',
);
const photo = path.join(dir, 'proof.png');
await writeFile(photo, png);
await mkdir('test-results', { recursive: true });
let app;
let page;
const errors = [];
const networkRequests = [];
async function launch() {
  app = await electron.launch({
    args: ['.'],
    timeout: 300000,
    env: { ...process.env, MATHCARDS_DATA_DIR: dir, MATHCARDS_DEV: '0' },
  });
  page = await app.firstWindow();
  await app.context().route(/^https?:/, (route) => {
    networkRequests.push(route.request().url());
    return route.abort();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.getByText('Личное пространство', { exact: true }).waitFor();
}
async function snap() {
  return await page.evaluate(() => window.mathcards.invoke('snapshot', undefined));
}
try {
  await launch();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Начать с чистого листа' }).click();
  const security = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
    };
  });
  expect(security).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true });
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  await page.getByRole('button', { name: 'Создать набор', exact: true }).first().click();
  await page.getByLabel('Название набора', { exact: true }).fill('Экзамен по матану');
  await page.getByRole('button', { name: 'Сохранить набор' }).click();
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await page.getByLabel('Название карточки').fill('Теорема Вейерштрасса');
  await page
    .getByRole('textbox', { name: 'Лицевая сторона', exact: true })
    .fill('Теорема Вейерштрасса об экстремумах');
  const back = page.getByRole('textbox', { name: 'Обратная сторона', exact: true });
  await back.fill('Непрерывная функция на отрезке достигает минимума и максимума.');
  await page
    .locator('.editor-box')
    .nth(1)
    .getByRole('button', { name: 'Вставить формулу', exact: true })
    .click();
  await page
    .getByLabel('LaTeX', { exact: true })
    .fill('\\forall x\\in[a,b]: f(x_{min})\\le f(x)\\le f(x_{max})');
  await page.getByRole('dialog').getByRole('button', { name: 'Вставить формулу' }).click();
  await expect(page.locator('.editor-box').nth(1).locator('.katex')).toBeVisible();
  await page.locator('.editor-box').nth(1).locator('.tiptap-mathematics-render').click();
  await expect(page.getByLabel('LaTeX', { exact: true })).toHaveValue(
    String.raw`\forall x\in[a,b]: f(x_{min})\le f(x)\le f(x_{max})`,
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Вставить формулу' }).click();
  await page.getByRole('textbox', { name: 'Лицевая сторона', exact: true }).click();
  await page
    .locator('.editor-box')
    .nth(0)
    .getByRole('button', { name: 'Вставить формулу', exact: true })
    .click();
  await page.getByLabel('LaTeX', { exact: true }).fill(String.raw`f\in C([a,b])`);
  await page.getByRole('checkbox', { name: 'Отдельной строкой' }).uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Вставить формулу' }).click();
  // Use real Electron OS clipboard and platform paste shortcut.
  await app.evaluate(async ({ clipboard, ClipboardItem }, base64) => {
    clipboard.clear();
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([Buffer.from(base64, 'base64')], { type: 'image/png' }),
      }),
    ]);
  }, png.toString('base64'));
  await back.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(back.locator('img')).toHaveCount(1);
  await back.locator('img').click();
  await page.getByLabel('Размер изображения').selectOption('50');
  const handle = page.getByRole('slider', { name: 'Нижний правый угол изображения' });
  await handle.scrollIntoViewIfNeeded();
  const before = await back.locator('img').boundingBox();
  const corner = await handle.boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 40, corner.y + corner.height / 2 + 25, {
    steps: 6,
  });
  await page.mouse.up();
  const resized = Number(await handle.getAttribute('aria-valuenow'));
  expect(resized).toBeGreaterThan(50);
  expect(resized).toBeLessThan(75);
  const after = await back.locator('img').boundingBox();
  expect(after.width / after.height).toBeCloseTo(before.width / before.height, 1);
  await page.getByRole('button', { name: 'Предпросмотр' }).click();
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).waitFor();
  let s = await snap();
  expect(s.cards).toHaveLength(1);
  expect(JSON.stringify(s.cards[0].back)).toContain('blockMath');
  expect(JSON.stringify(s.cards[0].back)).toContain('media://image/');
  expect(s.cards[0].back.content.find((n) => n.type === 'image').attrs.width).toBe(resized);
  // Create nine additional cards through the same validated IPC used by the UI.
  await page.evaluate(async () => {
    const s = await window.mathcards.invoke('snapshot', undefined);
    for (let i = 2; i <= 10; i++)
      await window.mathcards.invoke('saveCard', {
        ...s.cards[0],
        id: undefined,
        title: `Теорема ${i}`,
      });
  });
  await app.close();
  app = null;
  await launch();
  expect((await snap()).cards).toHaveLength(10);
  await page.getByRole('button', { name: 'Экзамен по матану', exact: true }).click();
  const checkboxes = page.locator('.card-row input[type=checkbox]');
  await expect(checkboxes).toHaveCount(10);
  await checkboxes.nth(0).check();
  await checkboxes.nth(3).check();
  await checkboxes.nth(7).check();
  await expect(page.getByText('Выбрано 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'В подборку', exact: true }).click();
  await page.getByLabel('Название подборки').fill('Билеты 1–5');
  await page.getByRole('button', { name: 'Сохранить подборку', exact: true }).click();
  await page.getByRole('button', { name: 'В подборку', exact: true }).click();
  await page.getByLabel('Добавить в подборку').selectOption((await snap()).collections[0].id);
  await page.getByRole('button', { name: 'Сохранить подборку', exact: true }).click();
  expect((await snap()).collections).toHaveLength(1);
  expect((await snap()).collections[0].cardIds).toHaveLength(3);
  await page.getByRole('button', { name: 'Изучать выбранные' }).click();
  await expect(page.getByText('Карточка 1 / 3')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.flashcard.show-back .katex')).toBeVisible();
  await expect(page.locator('.flashcard img')).toHaveCount(1);
  expect(
    await page.locator('.flashcard img').evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/study.png', animations: 'disabled', scale: 'css' });
  await page.keyboard.press('1');
  await expect(page.getByText('Карточка 2 / 3')).toBeVisible();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await app.close();
  app = null;
  await launch();
  await page.getByRole('button', { name: 'Продолжить сессию', exact: true }).click();
  await expect(page.getByText('Карточка 2 / 3')).toBeVisible();
  expect((await snap()).cards.filter((c) => c.schedule)).toHaveLength(1);
  await page.keyboard.press('Space');
  await page.keyboard.press('2');
  await expect(page.getByText('Карточка 3 / 3')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: 'Отличная работа' })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить неизвестные' }).click();
  await expect(page.getByText('Карточка 1 / 1')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Вернуться к карточкам' }).click();
  await page.getByRole('button', { name: /^Повторение/ }).click();
  await expect(page.locator('.card-row')).toHaveCount(7);
  await page.getByRole('button', { name: 'Запланированные', exact: true }).click();
  await expect(page.locator('.card-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Сложные и неизвестные', exact: true }).click();
  await expect(page.locator('.card-row')).toHaveCount(2);
  // Actual archive commands; automate only the native file-picker destination.
  const archive = path.join(dir, 'backup.zip');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, archive);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Экспортировать всё' }).click();
  await expect(page.getByText('Резервная копия сохранена', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Импортировать архив' }).click();
  await expect(page.getByText('Импортировано карточек: 10', { exact: true })).toBeVisible();
  s = await snap();
  expect(s.cards).toHaveLength(20);
  expect(s.collections).toHaveLength(2);
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({
    animations: 'disabled',
    scale: 'css',
    path: 'test-results/settings-dark.png',
  });
  await page.getByRole('button', { name: 'Светлая', exact: true }).click();
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await page.screenshot({
    animations: 'disabled',
    scale: 'css',
    path: 'test-results/home.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Все карточки', exact: true }).click();
  await page.screenshot({
    animations: 'disabled',
    scale: 'css',
    path: 'test-results/cards.png',
    fullPage: true,
  });
  // Image-only card: file picker and external drag/drop both use copied local assets.
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await page.getByLabel('Название карточки').fill('Только фотография');
  await page.locator('.editor-box').nth(1).locator('input[type=file]').setInputFiles(photo);
  await expect(
    page.getByRole('textbox', { name: 'Обратная сторона', exact: true }).locator('img'),
  ).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Лицевая сторона', exact: true }).evaluate(
    (el, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'proof.png', { type: 'image/png' }));
      el.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: el.getBoundingClientRect().x + 20,
          clientY: el.getBoundingClientRect().y + 20,
        }),
      );
    },
    [...png],
  );
  await expect(
    page.getByRole('textbox', { name: 'Лицевая сторона', exact: true }).locator('img'),
  ).toHaveCount(1);
  await page.screenshot({
    animations: 'disabled',
    scale: 'css',
    path: 'test-results/editor.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).waitFor();
  await rm(photo);
  // Verify a proof spanning many screens is scrollable, with its final paragraph reachable.
  await page.evaluate(async () => {
    const s = await window.mathcards.invoke('snapshot', undefined);
    await window.mathcards.invoke('saveCard', {
      ...s.cards[0],
      id: undefined,
      title: 'Длинное доказательство',
      back: {
        type: 'doc',
        content: Array.from({ length: 80 }, (_, i) => ({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text:
                i === 79
                  ? 'Доказательство завершено.'
                  : `Шаг ${i + 1}. По непрерывности и компактности получаем требуемое утверждение.`,
            },
          ],
        })),
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Все карточки', exact: true }).click();
  await page.getByLabel('Выбрать Длинное доказательство', { exact: true }).check();
  await page.getByRole('button', { name: 'Изучать выбранные' }).click();
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await expect(page.locator('.flashcard.show-back')).toBeVisible();
  expect(
    await page.locator('.flashcard-content').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await page.locator('.flashcard-content').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.getByText('Доказательство завершено.', { exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  expect(networkRequests).toEqual([]);
  expect(errors).toEqual([]);
  console.log(
    'E2E PASS: secure Electron, create/edit, KaTeX, OS clipboard, resize, file upload, drop, restart, 3/10 selection, collections, keyboard ratings, unknown-only repeat, ZIP round trip, themes, image-only card.',
  );
  await writeFile(
    'test-results/e2e-result.json',
    JSON.stringify(
      {
        passed: true,
        platform: process.platform,
        security,
        checks: 29,
        rendererErrors: errors,
        externalRequests: networkRequests,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  if (page)
    await page
      .screenshot({ animations: 'disabled', scale: 'css', path: 'test-results/failure.png' })
      .catch(() => {});
  throw error;
} finally {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.destroy();
      })
      .catch(() => {});
    await app.close();
  }
  await rm(dir, { recursive: true, force: true });
}
