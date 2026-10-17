import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';

/** `GET /auth/tenant/terms/status`: una llamada por sesión decide si el tenant debe aceptar una nueva versión. */
export interface AccountTermsStatus {
  accepted: boolean;
  currentVersion: string | null;
  acceptedVersion: string | null;
}

/** `POST /auth/tenant/terms/accept`: devuelve la versión que quedó aceptada. */
export interface AccountTermsAcceptance {
  tenantId: string;
  termsVersion: string;
  acceptedAtUtc: string;
}

/**
 * Puerta de términos del Account del landing: el backend bloquea con 409 `Terms.NotAccepted` cualquier
 * request autenticada de un tenant que no haya aceptado la versión vigente. Replica el patrón del CRM
 * (`TermsPageComponent` + `authGuard`), simplificado — el Account no necesita ni Privacy ni visor inline.
 */
@Injectable({ providedIn: 'root' })
export class AccountTermsService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;

  /** Cache por sesión: una vez aceptada la versión vigente, no se pregunta otra vez. */
  private readonly accepted = { value: false };

  isAcceptedThisSession(): boolean {
    return this.accepted.value;
  }

  markAcceptedThisSession(): void {
    this.accepted.value = true;
  }

  status(): Observable<AccountTermsStatus> {
    if (this.accepted.value) {
      // Evita round-trip al Account si ya pasó por el gate; el 409 del middleware es la red de seguridad real.
      return of<AccountTermsStatus>({ accepted: true, currentVersion: null, acceptedVersion: null });
    }
    return this.http
      .get<AccountTermsStatus>(`${this.base}/auth/tenant/terms/status`)
      .pipe(tap(status => (this.accepted.value = status.accepted)));
  }

  accept(): Observable<AccountTermsAcceptance> {
    return this.http
      .post<AccountTermsAcceptance>(`${this.base}/auth/tenant/terms/accept`, {})
      .pipe(
        tap(() => (this.accepted.value = true)),
        map(response => response)
      );
  }
}
