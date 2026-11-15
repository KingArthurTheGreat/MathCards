import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const executablePath = process.argv[2];
if (!executablePath) throw new Error('Передайте путь к упакованному исполняемому файлу');
const app = await electron.launch({ executablePath: path.resolve(executablePath), args: [] });
try {
  const page = await app.firstWindow();
  await page.getByText('Личное пространство', { exact: true }).waitFor();
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  const snapshot = await page.evaluate(() => window.mathcards.invoke('snapshot', undefined));
  expect(Array.isArray(snapshot.cards)).toBe(true);
  expect(page.url()).toBe('app://bundle/index.html');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({
    path: 'test-results/packaged.png',
    animations: 'disabled',
    scale: 'css',
  });
  await writeFile(
    'test-results/packaged-result.json',
    JSON.stringify(
      { passed: true, platform: process.platform, packaged: true, url: page.url() },
      null,
      2,
    ),
  );
  console.log(
    'Packaged application PASS: app.asar, renderer, secure preload and SQLite are working.',
  );
} finally {
  await app.close();
}
