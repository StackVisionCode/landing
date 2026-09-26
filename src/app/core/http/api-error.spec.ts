import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorCode } from './api-error';

describe('apiErrorCode', () => {
  it('lee el code de un handler', () => {
    expect(apiErrorCode(new HttpErrorResponse({ error: { code: 'Auth.Invalid' } }))).toBe('Auth.Invalid');
  });

  // El middleware de sesión no responde `code`, sino `type`.
  it('acepta el type de los middlewares de sesión', () => {
    expect(apiErrorCode(new HttpErrorResponse({ error: { type: 'Auth.SessionRevoked' } }))).toBe('Auth.SessionRevoked');
  });

  it('ignora el type de un problem details cualquiera', () => {
    expect(apiErrorCode(new HttpErrorResponse({ error: { type: 'https://httpstatuses.io/400' } }))).toBeNull();
  });

  it('sin cuerpo reconocible devuelve null', () => {
    expect(apiErrorCode(new HttpErrorResponse({ error: 'boom' }))).toBeNull();
    expect(apiErrorCode(new Error('offline'))).toBeNull();
  });
});
