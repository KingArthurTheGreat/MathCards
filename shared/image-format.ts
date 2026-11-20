export function imageExtension(b: Uint8Array): 'png' | 'jpg' | 'webp' {
  if (b.length < 12 || b.length > 20 * 1024 * 1024)
    throw new Error('Размер изображения: от 12 байт до 20 МБ');
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return 'png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP'
  )
    return 'webp';
  throw new Error('Поддерживаются только PNG, JPEG и WebP');
}
