const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfJstDay(now: number): number {
  return Math.floor((now + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
}

export function quizFinalizationTime(deadline: number): number {
  return startOfJstDay(deadline) + DAY_MS + 5 * 60 * 1000;
}
