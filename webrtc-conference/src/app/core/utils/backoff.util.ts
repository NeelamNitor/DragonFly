/** Full-jitter exponential backoff, capped at `maxMs`. */
export function computeBackoffDelay(attempt: number, baseMs = 500, maxMs = 15000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * exp);
}
