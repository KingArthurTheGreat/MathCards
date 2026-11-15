import { build, Platform, Arch } from 'electron-builder';
const signed = process.argv.includes('--signed');
if (signed && !(process.env.WIN_CSC_LINK || process.env.CSC_LINK)) {
  throw new Error(
    'Для подписанного установщика задайте WIN_CSC_LINK (сертификат PFX/P12) и WIN_CSC_KEY_PASSWORD через защищённые переменные окружения или GitHub Secrets. Сборка остановлена: неподписанный файл не будет выдан за подписанный.',
  );
}
await build({
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.x64),
  publish: 'never',
  config: {
    forceCodeSigning: signed,
    win: { signtoolOptions: { signingHashAlgorithms: ['sha256'] } },
  },
});
