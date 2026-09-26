import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import {
  DiscoverLoginResponse,
  DiscoverOutcome,
  HandoffTicketResponse,
  STAFF_ACCOUNT_KIND,
} from './central-login.models';

/**
 * Los dos primeros pasos del login central. Son anónimos y cross-tenant, así que van al host de sistema
 * igual que desde el espacio de trabajo. El tercero es del Account y vive en `AccountSessionService`.
 */
@Injectable({ providedIn: 'root' })
export class CentralLoginService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;

  /** Contraseña contra cada oficina del email. Solo cuentas de personal: el Account no es del cliente. */
  discover(email: string, password: string): Observable<DiscoverOutcome> {
    return this.http
      .post<DiscoverLoginResponse>(`${this.base}/auth/discover-login`, {
        email,
        password,
        accountKind: STAFF_ACCOUNT_KIND,
      })
      .pipe(map(interpret));
  }

  /** Elige oficina y resuelve el segundo factor; la contraseña ya quedó probada en el paso anterior. */
  handoff(sessionRef: string, tenantId: string, mfaCode: string | null): Observable<HandoffTicketResponse> {
    return this.http.post<HandoffTicketResponse>(`${this.base}/auth/session/handoff`, {
      discoverySessionRef: sessionRef,
      chosenTenantId: tenantId,
      mfaCode: mfaCode || null,
      accountKind: STAFF_ACCOUNT_KIND,
    });
  }
}

function interpret(response: DiscoverLoginResponse): DiscoverOutcome {
  if (response.ticket) {
    return { kind: 'ticket', ticket: response.ticket };
  }
  if (response.discoverySessionRef && response.offices) {
    return { kind: 'choose', sessionRef: response.discoverySessionRef, offices: response.offices };
  }
  throw new Error('Unexpected discover-login response.');
}
