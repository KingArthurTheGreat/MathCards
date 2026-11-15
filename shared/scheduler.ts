import type { Card, Rating } from './model';

export interface ReviewSchedule {
  repetitions: number;
  intervalDays: number;
  ease: number;
  dueAt: string;
  reviewedAt: string;
}
export interface ReviewEvent {
  rating: Rating;
  reviewedAt: string;
}
const DAY = 86_400_000;
const qualities: Record<Rating, number> = { unknown: 0, hard: 3, known: 5 };

/** SM-2 interval/easiness equations, adapted to our three recall buttons. */
export function scheduleReview(
  previous: ReviewSchedule | null,
  rating: Rating,
  at: string,
): ReviewSchedule {
  const quality = qualities[rating];
  const ease = previous?.ease ?? 2.5;
  const repetitions = quality < 3 ? 0 : (previous?.repetitions ?? 0) + 1;
  const intervalDays =
    quality < 3 || repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.min(36500, Math.ceil((previous?.intervalDays ?? 1) * ease));
  return {
    repetitions,
    intervalDays,
    ease: Math.max(
      1.3,
      Number((ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)).toFixed(2)),
    ),
    dueAt: new Date(Math.min(253402300799999, Date.parse(at) + intervalDays * DAY)).toISOString(),
    reviewedAt: at,
  };
}

/** Same-day drills replace the day's assessment instead of multiplying the interval. */
export function scheduleFromReviews(events: ReviewEvent[]): ReviewSchedule | null {
  const days = new Map<string, ReviewEvent>();
  for (const event of [...events].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))) {
    days.set(event.reviewedAt.slice(0, 10), event);
  }
  let schedule: ReviewSchedule | null = null;
  for (const event of days.values())
    schedule = scheduleReview(schedule, event.rating, event.reviewedAt);
  return schedule;
}
export function isDue(card: Pick<Card, 'schedule'>, at = Date.now()): boolean {
  return !card.schedule || Date.parse(card.schedule.dueAt) <= at;
}
export function dueLabel(card: Pick<Card, 'schedule'>, at = Date.now()): string {
  if (!card.schedule) return 'Новая';
  if (isDue(card, at)) return 'Пора повторить';
  return new Date(card.schedule.dueAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}
