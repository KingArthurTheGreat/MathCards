/** Project a corner drag onto the image's aspect ratio and persist responsive percent width. */
export function resizedWidth(
  percent: number,
  width: number,
  height: number,
  dx: number,
  dy: number,
): number {
  if (width <= 0) return percent;
  const ratio = height / width;
  const delta = (dx + dy * ratio) / (1 + ratio * ratio);
  return Math.round(Math.min(100, Math.max(10, (percent * (width + delta)) / width)) * 10) / 10;
}
