import { HttpErrorResponse } from '@angular/common/http';

/** Códigos que no vienen de un handler sino de un middleware, que responde `type` en vez de `code`. */
const MIDDLEWARE_CODES = new Set(['Auth.SessionRevoked', 'Auth.SessionDenylistUnavailable']);

/**
 * Código de negocio del error. Los handlers responden `{ code, message }`; los middlewares de sesión
 * usan `{ type, title }`, así que solo de esos se acepta el `type` (otro `type` es una URI de RFC 7807).
 */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body = error.error as { code?: unknown; type?: unknown } | null;
  if (body && typeof body === 'object') {
    if (typeof body.code === 'string') {
      return body.code;
    }
    if (typeof body.type === 'string' && MIDDLEWARE_CODES.has(body.type)) {
      return body.type;
    }
  }
  return null;
}
