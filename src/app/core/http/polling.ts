/**
 * Backoff del polling: arranca en `baseMs`, crece ×1.5 por intento y se queda en `maxMs`. Si el backend
 * pidió esperar (429/503), manda su espera.
 */
export function nextPollDelayMs(attempt: number, baseMs: number, maxMs: number, retryAfterSeconds?: number | null): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(maxMs, Math.round(baseMs * Math.pow(1.5, Math.max(0, attempt))));
}
