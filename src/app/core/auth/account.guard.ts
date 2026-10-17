import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AccountSessionStore } from './account-session.store';

/**
 * Puerta del Account. Recupera la sesión de la cookie (al recargar el access token se perdió) y solo deja
 * pasar al administrador de la oficina. Es defensa en profundidad: el backend ya rechaza al resto, esto
 * evita pintar pantallas que sus llamadas no van a poder llenar.
 */
export const accountGuard: CanActivateFn = (_route, state) => {
  const store = inject(AccountSessionStore);
  const router = inject(Router);
  // El gate de términos puede dejar la sesión activa SIN perfil cargado (el /auth/me respondió 409).
  // El rol de admin ya se validó al emitir el token, así que esta pantalla deja pasar aunque me esté
  // vacío; la verificación de isAccountAdmin sigue aplicando al resto del shell.
  const isTermsGate = state.url.startsWith('/account/accept-terms');

  return store.restore().pipe(
    map(status => {
      if (status === 'active') {
        if (isTermsGate) return true;
        // Sesión activa pero sin perfil cargado = el gate de términos del backend respondió 409 al
        // /auth/me y el store conservó el token sin armar el `me`. Mandarlo directo al gate — no a
        // /no-access — para que acepte y pueda volver al shell. El resto del shell sigue exigiendo
        // isAccountAdmin.
        if (!store.me()) return router.createUrlTree(['/account/accept-terms']);
        return store.isAccountAdmin() || router.createUrlTree(['/account/no-access']);
      }
      if (status === 'revoked') {
        return router.createUrlTree(['/account/session-ended']);
      }
      // Se guarda a dónde iba para no dejarlo en el resumen después de iniciar sesión.
      return router.createUrlTree(['/account/sign-in'], {
        queryParams: state.url === '/account' ? {} : { returnUrl: state.url },
      });
    })
  );
};
