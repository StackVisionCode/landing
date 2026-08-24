import { HttpErrorResponse } from '@angular/common/http';

/** El backend devuelve errores como `{ code, message }` — extrae el code para mapearlo a copy traducido. */
export function apiErrorCode(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { code?: string } | null;
    return body?.code ?? null;
  }
  return null;
}
