import type { Card, Rating, StudySession } from './model';
export function selectRange(cards: Pick<Card, 'id'>[], start: number, end: number): string[] {
  return cards.slice(Math.max(0, Math.min(start, end)), Math.max(start, end) + 1).map((c) => c.id);
}
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function repeatIds(session: StudySession, ratings: Rating[]): string[] {
  return session.results.filter((r) => ratings.includes(r.rating)).map((r) => r.cardId);
}
