import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { ACCOUNT_ACTOR_TYPE, AccountSessionResponse, MeResponse, ReauthenticateRequest } from './account-session.models';
import { AccountSessionService } from './account-session.service';

/**
 * - `unknown`: todavía no se intentó recuperar la sesión de la cookie.
 * - `anonymous`: no hay sesión (o terminó por logout).
 * - `revoked`: la sesión se cerró desde otro lado (takeover, logout global, baja del usuario).
 */
export type AccountSessionStatus = 'unknown' | 'active' | 'anonymous' | 'revoked';

/**
 * Desenlace de la entrada directa. La sesion unica hace que entrar aca cierre la del espacio de trabajo,
 * asi que cuando ya hay una abierta el backend pide confirmarlo en vez de pisarla.
 */
export type AccountSignInOutcome =
  | { kind: 'signed-in' }
  | { kind: 'takeover-required'; ticket: string; expiresInSeconds: number };

/**
 * Sesión del Account en el Landing. El access token vive **solo en memoria** (el Landing carga scripts de
 * terceros): al recargar se pierde y se recupera con la cookie del refresh, que el JS nunca ve.
 */
@Injectable({ providedIn: 'root' })
export class AccountSessionStore {
  private readonly api = inject(AccountSessionService);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _me = signal<MeResponse | null>(null);
  private readonly _status = signal<AccountSessionStatus>('unknown');

  /** Refresh en vuelo compartido: varias respuestas 401 a la vez rotan el token una sola vez. */
  private refreshInFlight: Observable<string> | null = null;
  private restoreInFlight: Observable<AccountSessionStatus> | null = null;

  readonly me = this._me.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isSignedIn = computed(() => this._status() === 'active');
  /** El backend ya lo exige al abrir la sesión; acá es para no pintar pantallas que el backend va a rechazar. */
  readonly isAccountAdmin = computed(() => this._me()?.actorType === ACCOUNT_ACTOR_TYPE);

  accessToken(): string | null {
    return this._accessToken();
  }

  /**
   * Recupera la sesión desde la cookie al entrar o recargar. Single-flight: el guard y la primera
   * llamada del shell comparten el mismo intento.
   */
  restore(): Observable<AccountSessionStatus> {
    if (this._status() !== 'unknown') {
      return of(this._status());
    }
    this.restoreInFlight ??= this.api.refresh().pipe(
      switchMap(tokens => this.applyTokens(tokens)),
      map(() => this._status()),
      catchError(() => {
        // `applyTokens` ya pudo decidir (p.ej. la sesión murió); solo se cae a anónima si nadie decidió.
        if (this._status() === 'unknown') {
          this.clear('anonymous');
        }
        return of(this._status());
      }),
      finalize(() => (this.restoreInFlight = null)),
      shareReplay(1)
    );
    return this.restoreInFlight;
  }

  /** Canje del vale del CRM: abre el Account sobre la misma sesión del workspace. */
  startFromHandoff(ticket: string): Observable<AccountSessionStatus> {
    return this.api.fromHandoff({ ticket }).pipe(
      switchMap(tokens => this.applyTokens(tokens)),
      map(() => this._status())
    );
  }

  /**
   * Entrada directa: canjea el vale del login central. Es una sesión nueva, así que si el usuario ya
   * tenía una abierta el backend no la pisa — devuelve un vale para que lo confirme.
   */
  startFromLogin(ticket: string): Observable<AccountSignInOutcome> {
    return this.api.fromLogin({ ticket }).pipe(switchMap(tokens => this.signIn(tokens)));
  }

  /** El usuario confirmó cerrar su otra sesión. */
  confirmTakeover(ticket: string): Observable<AccountSignInOutcome> {
    return this.api.takeover({ ticket }).pipe(switchMap(tokens => this.signIn(tokens)));
  }

  private signIn(tokens: AccountSessionResponse): Observable<AccountSignInOutcome> {
    if (tokens.takeoverRequired && tokens.takeoverTicket) {
      return of({
        kind: 'takeover-required' as const,
        ticket: tokens.takeoverTicket,
        expiresInSeconds: tokens.takeoverTicketExpiresInSeconds ?? 0,
      });
    }
    return this.applyTokens(tokens).pipe(map(() => ({ kind: 'signed-in' as const })));
  }

  /** Rota el access token. Lo llama el interceptor ante un 401 que no sea sesión revocada. */
  refreshAccess(): Observable<string> {
    this.refreshInFlight ??= this.api.refresh().pipe(
      switchMap(tokens => this.applyTokens(tokens)),
      map(token => token),
      finalize(() => (this.refreshInFlight = null)),
      shareReplay(1)
    );
    return this.refreshInFlight;
  }

  /**
   * Step-up: cambia el access token por uno elevado de la MISMA sesión. Como el refresh no copia
   * `reauth_at`, la elevación se pierde en la próxima rotación y se vuelve a pedir cuando haga falta.
   */
  elevate(request: ReauthenticateRequest): Observable<void> {
    return this.api.reauthenticate(request).pipe(
      tap(tokens => this._accessToken.set(tokens.accessToken)),
      map(() => void 0)
    );
  }

  /** La sesión murió en el backend: no hay nada que reintentar. */
  markRevoked(): void {
    this.clear('revoked');
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(
      catchError(() => of(void 0)),
      tap(() => this.clear('anonymous'))
    );
  }

  /** Guarda los tokens y carga el perfil; sin perfil no hay sesión utilizable. */
  private applyTokens(tokens: AccountSessionResponse): Observable<string> {
    if (!tokens.accessToken) {
      // Sin token y sin `takeoverRequired` que lo explique no hay sesion que armar.
      this.clear('anonymous');
      return throwError(() => new Error('Account session was not issued.'));
    }
    const accessToken = tokens.accessToken;
    this._accessToken.set(accessToken);
    return this.api.me().pipe(
      tap(me => {
        this._me.set(me);
        this._status.set('active');
      }),
      map(() => accessToken),
      catchError((err: unknown) => {
        this.clear(err instanceof HttpErrorResponse && err.status === 401 ? 'revoked' : 'anonymous');
        return throwError(() => err);
      })
    );
  }

  private clear(status: Exclude<AccountSessionStatus, 'unknown' | 'active'>): void {
    this._accessToken.set(null);
    this._me.set(null);
    this._status.set(status);
  }
}
