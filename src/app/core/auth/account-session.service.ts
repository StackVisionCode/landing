import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import {
  AccountSessionResponse,
  AccountTicketRequest,
  MeResponse,
  PublicBrandingResponse,
  ReauthenticateRequest,
  ReauthenticateResponse,
} from './account-session.models';

/**
 * HTTP del Account, sin estado. La sesión la maneja `AccountSessionStore`.
 *
 * `withCredentials` en los endpoints de sesión: el refresh viaja en la cookie `__Host-tv-account-rt`,
 * que el backend lee y reescribe. Auth solo acepta estas llamadas desde un `Origin` de su allowlist.
 */
@Injectable({ providedIn: 'root' })
export class AccountSessionService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;
  private readonly withCookie = { withCredentials: true } as const;

  /** Canjea el vale que trae el CRM: suma el Account a la misma sesión, sin takeover. */
  fromHandoff(request: AccountTicketRequest): Observable<AccountSessionResponse> {
    return this.http.post<AccountSessionResponse>(
      `${this.base}/auth/account/session/from-handoff`,
      request,
      this.withCookie
    );
  }

  /** Canjea el vale del login central: sesión nueva, y si ya había otra abierta pide confirmarla. */
  fromLogin(request: AccountTicketRequest): Observable<AccountSessionResponse> {
    return this.http.post<AccountSessionResponse>(
      `${this.base}/auth/account/session/from-login`,
      request,
      this.withCookie
    );
  }

  /** El usuario confirmó cerrar su otra sesión. */
  takeover(request: AccountTicketRequest): Observable<AccountSessionResponse> {
    return this.http.post<AccountSessionResponse>(
      `${this.base}/auth/account/session/takeover`,
      request,
      this.withCookie
    );
  }

  /** Rota el refresh de la cookie. Un 401 significa que la sesión del Account terminó. */
  refresh(): Observable<AccountSessionResponse> {
    return this.http.post<AccountSessionResponse>(`${this.base}/auth/account/session/refresh`, {}, this.withCookie);
  }

  /** Cierra el Account. Si se entró desde el CRM, el CRM sigue abierto. */
  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/account/session/logout`, {}, this.withCookie);
  }

  /** Step-up: confirma la contraseña y devuelve un token de la misma sesión, ya elevado. */
  reauthenticate(request: ReauthenticateRequest): Observable<ReauthenticateResponse> {
    return this.http.post<ReauthenticateResponse>(`${this.base}/auth/reauthenticate`, request);
  }

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.base}/auth/me`);
  }

  /** Marca por slug: endpoint anónimo y solo con assets ya escaneados, el mismo que usa el login. */
  officeBranding(slug: string): Observable<PublicBrandingResponse> {
    return this.http.get<PublicBrandingResponse>(
      `${this.base}/tenants/branding/public/${encodeURIComponent(slug)}?surface=Crm`
    );
  }

  /** URL absoluta de un asset de marca; el backend devuelve la ruta relativa. */
  assetUrl(path: string): string {
    return path.startsWith('http') ? path : `${this.base}${path}`;
  }
}
