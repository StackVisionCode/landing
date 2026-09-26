import { HttpErrorResponse } from '@angular/common/http';

/**
 * Rechazos "espera y reintenta" del backend: el rate limit HTTP (429 `RateLimit.Exceeded`), los throttles
 * de dominio (429 con su propio código, p. ej. `Onboarding.ResendCooldown`) y el load shedding del Gateway
 * (503 `LoadShedding.Active`). Todos traen la espera en `retryAfterSeconds` y/o en `Retry-After`.
 * Un 503 sin ese código (servicio caído, denylist de sesión) no es un throttle: es un error transitorio.
 */
export const RATE_LIMIT_CODE = 'RateLimit.Exceeded';
export const LOAD_SHEDDING_CODE = 'LoadShedding.Active';

/** Si el backend no informa la espera, se bloquea la acción este tiempo para no martillar. */
export const DEFAULT_WAIT_SECONDS = 30;

export type ThrottleKind = 'rate-limited' | 'overloaded';

export interface Throttle {
  readonly kind: ThrottleKind;
  /** Código de negocio del throttle de dominio; null en el rate limit genérico. */
  readonly code: string | null;
  readonly retryAfterSeconds: number;
}

export function readThrottle(err: unknown): Throttle | null {
  if (!(err instanceof HttpErrorResponse)) {
    return null;
  }
  const code = bodyCode(err.error);
  if (err.status === 429) {
    return {
      kind: 'rate-limited',
      code: code === RATE_LIMIT_CODE ? null : code,
      retryAfterSeconds: retryAfterSeconds(err) ?? DEFAULT_WAIT_SECONDS,
    };
  }
  if (err.status === 503 && code === LOAD_SHEDDING_CODE) {
    return { kind: 'overloaded', code: null, retryAfterSeconds: retryAfterSeconds(err) ?? DEFAULT_WAIT_SECONDS };
  }
  return null;
}

/** Reloj corto "0:58" para la cuenta regresiva del botón bloqueado. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function bodyCode(body: unknown): string | null {
  if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
    return body.code;
  }
  if (typeof body === 'string' && body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(body) as { code?: unknown };
      return typeof parsed.code === 'string' ? parsed.code : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** `retryAfterSeconds` del body (contrato del backend) o, si no está, el header `Retry-After`. */
function retryAfterSeconds(err: HttpErrorResponse): number | null {
  const body = err.error as { retryAfterSeconds?: unknown } | null;
  if (body && typeof body === 'object' && typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0) {
    return Math.ceil(body.retryAfterSeconds);
  }
  const header = err.headers?.get('Retry-After');
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) {
    return null;
  }
  const fromDate = Math.ceil((date - Date.now()) / 1000);
  return fromDate > 0 ? fromDate : null;
}
