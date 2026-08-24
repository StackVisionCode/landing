import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import { TokenService } from './token.service';
import {
  ApiResponse,
  ExistingSessionInfo,
  LoginCredentials,
  LoginResponse,
  LoginResult,
  RegisterData,
  RegisterResult,
  UserProfile,
} from './auth.models';

/**
 * Auth del landing contra la API real (portado de LandingPageTaxProSuite):
 * login con detección de sesión existente (409 → force-login), registro con
 * confirmación por correo, y restauración de sesión desde el token guardado.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = SITE_CONFIG.apiUrl;

  private readonly currentUserSignal = signal<UserProfile | null>(null);
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.restoreSession();
    }
  }

  /** Rehidrata la sesión si quedó un token válido de una visita anterior. */
  private restoreSession(): void {
    if (this.tokenService.token && !this.tokenService.isTokenExpired()) {
      this.loadUserProfile().subscribe({
        error: () => this.tokenService.removeTokens(),
      });
    } else if (this.tokenService.token) {
      this.tokenService.removeTokens();
    }
  }

  login(credentials: LoginCredentials): Observable<LoginResult> {
    return this.requestLogin(`${this.apiUrl}/landing/session/login`, credentials);
  }

  /** Cierra la sesión existente en el otro dispositivo e inicia una nueva. */
  forceLogin(credentials: LoginCredentials): Observable<LoginResult> {
    return this.requestLogin(`${this.apiUrl}/landing/session/force-login`, credentials);
  }

  private requestLogin(url: string, credentials: LoginCredentials): Observable<LoginResult> {
    const loginDto = {
      email: credentials.email,
      password: credentials.password,
      remember: credentials.remember ?? false,
    };

    return this.http.post<ApiResponse<LoginResponse>>(url, loginDto).pipe(
      switchMap((response) => {
        if (response.success && response.data) {
          this.tokenService.setTokens(response.data.tokenRequest, response.data.tokenRefresh);
          return this.loadUserProfile().pipe(
            map((user): LoginResult => {
              if (user) {
                return { success: true, user };
              }
              throw new Error('Unable to load user profile');
            }),
          );
        }
        throw new Error(response.message || 'Authentication error');
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 409 || error.error?.statusCode === 409) {
          const existingSession: ExistingSessionInfo = {
            message: error.error?.message || 'You already have an active session on another device.',
          };
          return of<LoginResult>({ success: false, existingSession, error: existingSession.message });
        }
        return of<LoginResult>({ success: false, error: this.extractErrorMessage(error) });
      }),
    );
  }

  register(data: RegisterData): Observable<RegisterResult> {
    const registerDto = {
      name: data.name,
      lastName: data.lastName,
      email: data.email,
      companyName: data.companyName,
      phoneNumber: data.phoneNumber,
      password: data.password,
    };

    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/landing/register/create`, registerDto).pipe(
      map((response): RegisterResult => {
        if (response.success) {
          return { success: true };
        }
        throw new Error(response.message || 'Registration error');
      }),
      catchError((error) => of<RegisterResult>({ success: false, error: this.extractErrorMessage(error) })),
    );
  }

  loadUserProfile(): Observable<UserProfile | null> {
    const token = this.tokenService.token;
    if (!token) {
      this.currentUserSignal.set(null);
      return of(null);
    }

    return this.http
      .get<ApiResponse<UserProfile>>(`${this.apiUrl}/landing/session/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .pipe(
        map((response) => {
          if (response.success && response.data) {
            const user = response.data;
            user.fullName = `${user.name || ''} ${user.lastName || ''}`.trim() || user.email;
            user.displayName = user.companyName || user.fullName;
            this.currentUserSignal.set(user);
            return user;
          }
          this.currentUserSignal.set(null);
          return null;
        }),
        catchError(() => {
          this.currentUserSignal.set(null);
          return of(null);
        }),
      );
  }

  logout(): void {
    const token = this.tokenService.token;
    if (token) {
      this.http
        .post(`${this.apiUrl}/landing/session/logout`, {}, { headers: { Authorization: `Bearer ${token}` } })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
    this.tokenService.removeTokens();
    this.currentUserSignal.set(null);
  }

  private extractErrorMessage(error: unknown): string {
    const err = error as { error?: { message?: string }; message?: string };
    if (err?.error?.message) {
      return err.error.message;
    }
    if (err?.message) {
      return err.message;
    }
    return 'An unexpected error has occurred';
  }
}
