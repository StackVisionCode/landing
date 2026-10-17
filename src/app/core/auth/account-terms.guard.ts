import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AccountTermsService } from '@core/account/account-terms.service';

/**
 * Puerta de términos del Account del landing. Corre DESPUÉS de `accountGuard` (asume sesión activa).
 * Si el tenant no aceptó la versión vigente, desvía a `/account/accept-terms` — sin esto el backend
 * rechazaba toda llamada con 409 y el user quedaba en pantalla gris sin poder desbloquearse (el CRM
 * resuelve esto con su propio `TermsPageComponent`; acá se replica el patrón, simplificado).
 *
 * Fail-open deliberado (igual que el CRM): si `/terms/status` falla por red, el user pasa y el backend
 * sigue respondiendo 409 a cada endpoint real — mejor eso que negar el acceso por un hipo del gateway.
 */
export const accountTermsGuard: CanActivateFn = () => {
  const terms = inject(AccountTermsService);
  const router = inject(Router);

  if (terms.isAcceptedThisSession()) {
    return true;
  }

  return terms.status().pipe(
    map(status => (status.accepted ? true : router.createUrlTree(['/account/accept-terms']))),
    catchError(() => of(true))
  );
};
