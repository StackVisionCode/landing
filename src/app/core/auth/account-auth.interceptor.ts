import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import { apiErrorCode } from '@core/http/api-error';
import { AccountSessionStore } from './account-session.store';

/** Endpoints que abren o rotan la sesión: se autentican con la cookie, no con el access token. */
const SESSION_PATH = '/auth/account/session/';

const SESSION_REVOKED_CODE = 'Auth.SessionRevoked';

/** Step-up: rotar el token no lo resuelve (el refresh no copia `reauth_at`); lo resuelve la pantalla. */
const REAUTH_REQUIRED_CODE = 'Auth.ReauthenticationRequired';

/**
 * Terms gate: el middleware TermsAcceptanceMiddleware bloquea con 409 toda llamada autenticada de un
 * tenant que no haya aceptado la versión vigente. El guard de ruta ya desvía si el GET /terms/status
 * falla, pero puede llegar primero una llamada autenticada (p.ej. /auth/me del shell) que dispare el
 * 409 antes de que el guard corra. Este interceptor captura ese caso y lleva al usuario a aceptar,
 * en vez de dejarlo con pantalla rota.
 */
const TERMS_NOT_ACCEPTED_CODE = 'Terms.NotAccepted';
const ACCEPT_TERMS_PATH = '/account/accept-terms';

/** Marca la request que ya se reintentó con un token nuevo, para no entrar en bucle de refresh. */
const RETRIED = new HttpContextToken<boolean>(() => false);

/**
 * Autenticación del Account: pone el Bearer y, ante un 401, rota el token una vez y reintenta.
 *
 * Nunca cierra la sesión por un problema pasajero: un 429, un 503 o un corte de red al rotar dejan la
 * sesión intacta y el error llega a la pantalla, que decide si reintentar. Solo termina la sesión cuando
 * el backend dice que ya no existe (401 al rotar, o `Auth.SessionRevoked` por takeover o logout global).
 */
export const accountAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AccountSessionStore);
  const router = inject(Router);

  if (!req.url.startsWith(SITE_CONFIG.apiUrl) || req.url.includes(SESSION_PATH)) {
    return next(req);
  }

  const authorized = (token: string | null): HttpRequest<unknown> =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  const handleError = (err: unknown): Observable<HttpEvent<unknown>> => {
    // 409 Terms.NotAccepted: el middleware del backend bloquea TODA llamada autenticada hasta aceptar
    // la versión vigente. Un GET /auth/me del shell lo dispara antes de que el guard de ruta pueda
    // actuar; sin este branch el user queda en pantalla rota con "sign-in attempt expired" porque
    // el shell no termina de cargarse. Esto NO cierra la sesión — el user solo tiene que aceptar.
    if (
      err instanceof HttpErrorResponse
      && err.status === 409
      && apiErrorCode(err) === TERMS_NOT_ACCEPTED_CODE
      && !router.url.startsWith(ACCEPT_TERMS_PATH)
    ) {
      void router.navigate([ACCEPT_TERMS_PATH], { replaceUrl: true });
      return throwError(() => err);
    }

    const is401 = err instanceof HttpErrorResponse && err.status === 401;
    if (!is401 || req.context.get(RETRIED) || !store.accessToken()) {
      return throwError(() => err);
    }
    const code = apiErrorCode(err);
    if (code === SESSION_REVOKED_CODE) {
      store.markRevoked();
      return throwError(() => err);
    }
    if (code === REAUTH_REQUIRED_CODE) {
      return throwError(() => err);
    }
    return store.refreshAccess().pipe(
      switchMap(token =>
        next(
          req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
            context: req.context.set(RETRIED, true),
          })
        )
      ),
      catchError((refreshErr: unknown) => {
        // Solo un rechazo del refresh cierra la sesión; lo demás es transitorio y la deja viva.
        if (refreshErr instanceof HttpErrorResponse && refreshErr.status === 401) {
          store.markRevoked();
        }
        return throwError(() => err);
      })
    );
  };

  return next(authorized(store.accessToken())).pipe(catchError(handleError));
};
