import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import { accountAuthInterceptor } from './account-auth.interceptor';
import { AccountSessionStore } from './account-session.store';

const API = SITE_CONFIG.apiUrl;

describe('accountAuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: {
    accessToken: ReturnType<typeof vi.fn>;
    refreshAccess: ReturnType<typeof vi.fn>;
    markRevoked: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    store = {
      accessToken: vi.fn(() => 'at-1'),
      refreshAccess: vi.fn(() => of('at-2')),
      markRevoked: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([accountAuthInterceptor])),
        provideHttpClientTesting(),
        { provide: AccountSessionStore, useValue: store },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('firma las llamadas a la API con el token en memoria', () => {
    http.get(`${API}/auth/me`).subscribe();

    const req = httpMock.expectOne(`${API}/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer at-1');
    req.flush({});
  });

  it('no toca los endpoints de sesión: se autentican con la cookie', () => {
    http.post(`${API}/auth/account/session/refresh`, {}).subscribe();

    const req = httpMock.expectOne(`${API}/auth/account/session/refresh`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('deja pasar lo que no es de la API', () => {
    http.get('https://cdn.example.com/logo.png').subscribe();

    const req = httpMock.expectOne('https://cdn.example.com/logo.png');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('ante un 401 rota el token y reintenta una sola vez', () => {
    let body: unknown;
    http.get(`${API}/subscriptions/me/account`).subscribe(res => (body = res));

    httpMock.expectOne(`${API}/subscriptions/me/account`).flush({}, { status: 401, statusText: 'Unauthorized' });
    const retry = httpMock.expectOne(`${API}/subscriptions/me/account`);

    expect(retry.request.headers.get('Authorization')).toBe('Bearer at-2');
    retry.flush({ plan: 'pro' });
    expect(body).toEqual({ plan: 'pro' });
    expect(store.markRevoked).not.toHaveBeenCalled();
  });

  it('si el reintento vuelve a fallar no entra en bucle', () => {
    let failed: HttpErrorResponse | undefined;
    http.get(`${API}/auth/me`).subscribe({ error: err => (failed = err) });

    httpMock.expectOne(`${API}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne(`${API}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(failed?.status).toBe(401);
    expect(store.refreshAccess).toHaveBeenCalledOnce();
  });

  // Regresión del requisito "refresh sin logout": un throttle al rotar no puede echar al usuario.
  it('un 429 al rotar el token deja la sesión viva', () => {
    const throttled = new HttpErrorResponse({ status: 429, error: { code: 'RateLimit.Exceeded' } });
    store.refreshAccess = vi.fn(() => throwError(() => throttled));
    let failed: HttpErrorResponse | undefined;

    http.get(`${API}/auth/me`).subscribe({ error: err => (failed = err) });
    httpMock.expectOne(`${API}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(store.markRevoked).not.toHaveBeenCalled();
    expect(failed?.status).toBe(401);
  });

  it('un refresh rechazado termina la sesión', () => {
    store.refreshAccess = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 })));

    http.get(`${API}/auth/me`).subscribe({ error: () => undefined });
    httpMock.expectOne(`${API}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(store.markRevoked).toHaveBeenCalledOnce();
  });

  // El middleware de sesión responde `type`, no `code`.
  it('una sesión revocada termina sin intentar rotar el token', () => {
    http.get(`${API}/auth/me`).subscribe({ error: () => undefined });

    httpMock
      .expectOne(`${API}/auth/me`)
      .flush({ type: 'Auth.SessionRevoked', title: 'Session has been revoked.' }, { status: 401, statusText: 'Unauthorized' });

    expect(store.markRevoked).toHaveBeenCalledOnce();
    expect(store.refreshAccess).not.toHaveBeenCalled();
  });

  // Permisos cambiados en caliente: el backend pide un token nuevo, no cerrar la sesion.
  it('un token con permisos viejos se rota y la llamada se reintenta', () => {
    let body: unknown;
    http.get(`${API}/subscriptions/me/account`).subscribe(res => (body = res));

    httpMock
      .expectOne(`${API}/subscriptions/me/account`)
      .flush({ code: 'Auth.TokenStale' }, { status: 401, statusText: 'Unauthorized' });

    const retry = httpMock.expectOne(`${API}/subscriptions/me/account`);
    retry.flush({ plan: 'pro' });

    expect(store.refreshAccess).toHaveBeenCalledOnce();
    expect(store.markRevoked).not.toHaveBeenCalled();
    expect(body).toEqual({ plan: 'pro' });
  });

  // El step-up no se arregla rotando: el refresh no copia `reauth_at`, lo resuelve la pantalla.
  it('un step-up pendiente no rota el token', () => {
    let failed: HttpErrorResponse | undefined;
    http.post(`${API}/subscriptions/cancel`, {}).subscribe({ error: err => (failed = err) });

    httpMock
      .expectOne(`${API}/subscriptions/cancel`)
      .flush({ code: 'Auth.ReauthenticationRequired' }, { status: 401, statusText: 'Unauthorized' });

    expect(store.refreshAccess).not.toHaveBeenCalled();
    expect(store.markRevoked).not.toHaveBeenCalled();
    expect(failed?.status).toBe(401);
  });

  // Un token del Account fuera de su superficie es 403: no hay token nuevo que lo arregle.
  it('una superficie no permitida llega a la pantalla sin rotar ni cerrar sesion', () => {
    let failed: HttpErrorResponse | undefined;
    http.get(`${API}/customers`).subscribe({ error: err => (failed = err) });

    httpMock
      .expectOne(`${API}/customers`)
      .flush({ code: 'Auth.SurfaceNotAllowed' }, { status: 403, statusText: 'Forbidden' });

    expect(store.refreshAccess).not.toHaveBeenCalled();
    expect(store.markRevoked).not.toHaveBeenCalled();
    expect(failed?.status).toBe(403);
  });
});
