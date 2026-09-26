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

  return store.restore().pipe(
    map(status => {
      if (status === 'active') {
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
