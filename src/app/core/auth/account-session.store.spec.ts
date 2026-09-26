import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AccountSessionService } from './account-session.service';
import { AccountSessionStore } from './account-session.store';

const admin = {
  id: 'u1',
  name: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  actorType: 'TenantAdmin',
  tenant: { id: 't1', name: 'CoreTaxPro', subDomain: 'coretaxpro' },
  roles: [],
  permissions: ['billing.view'],
};

function unauthorized() {
  return new HttpErrorResponse({ status: 401, error: { code: 'Auth.InvalidRefreshToken' } });
}

describe('AccountSessionStore', () => {
  function create(overrides: object = {}) {
    const api = {
      refresh: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900 })),
      fromHandoff: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900 })),
      fromLogin: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900 })),
      takeover: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900 })),
      logout: vi.fn(() => of(void 0)),
      me: vi.fn(() => of(admin)),
      ...overrides,
    };
    TestBed.configureTestingModule({ providers: [{ provide: AccountSessionService, useValue: api }] });
    return { store: TestBed.inject(AccountSessionStore), api };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('recupera la sesión desde la cookie y carga el perfil', () => {
    const { store, api } = create();

    store.restore().subscribe();

    expect(api.refresh).toHaveBeenCalledOnce();
    expect(store.status()).toBe('active');
    expect(store.isAccountAdmin()).toBe(true);
    expect(store.accessToken()).toBe('at-1');
  });

  it('sin cookie válida queda anónima, sin token ni perfil', () => {
    const { store } = create({ refresh: vi.fn(() => throwError(() => unauthorized())) });

    store.restore().subscribe();

    expect(store.status()).toBe('anonymous');
    expect(store.accessToken()).toBeNull();
  });

  it('no vuelve a intentar recuperar una sesión ya resuelta', () => {
    const { store, api } = create();

    store.restore().subscribe();
    store.restore().subscribe();

    expect(api.refresh).toHaveBeenCalledOnce();
  });

  // El refresh de la cookie no negocia takeovers: si vuelve sin token, no hay sesión que armar.
  it('un refresh sin token deja la sesión anónima', () => {
    const { store } = create({
      refresh: vi.fn(() => of({ accessToken: null, expiresInSeconds: 0, takeoverRequired: true, takeoverTicket: 'tk' })),
    });

    store.restore().subscribe();

    expect(store.status()).toBe('anonymous');
  });

  it('la entrada directa canjea el vale del login central y abre la sesión', () => {
    const { store, api } = create();
    let outcome: unknown;

    store.startFromLogin('tk-1').subscribe(value => (outcome = value));

    expect(api.fromLogin).toHaveBeenCalledWith({ ticket: 'tk-1' });
    expect(outcome).toEqual({ kind: 'signed-in' });
    expect(store.status()).toBe('active');
  });

  // Sesión única: con otra sesión abierta el backend no la pisa, devuelve el vale para confirmarlo.
  it('con otra sesión abierta devuelve el vale de confirmación en vez de entrar', () => {
    const { store } = create({
      fromLogin: vi.fn(() =>
        of({ accessToken: null, expiresInSeconds: 0, takeoverRequired: true, takeoverTicket: 'tk-2', takeoverTicketExpiresInSeconds: 60 })
      ),
    });
    let outcome: unknown;

    store.startFromLogin('tk-1').subscribe(value => (outcome = value));

    expect(outcome).toEqual({ kind: 'takeover-required', ticket: 'tk-2', expiresInSeconds: 60 });
    expect(store.status()).toBe('unknown');
  });

  it('confirmado el takeover, la sesión queda lista', () => {
    const { store, api } = create();

    store.confirmTakeover('tk-2').subscribe();

    expect(api.takeover).toHaveBeenCalledWith({ ticket: 'tk-2' });
    expect(store.status()).toBe('active');
  });

  it('canjea el vale del CRM y deja la sesión lista', () => {
    const { store, api } = create();

    store.startFromHandoff('ticket-1').subscribe();

    expect(api.fromHandoff).toHaveBeenCalledWith({ ticket: 'ticket-1' });
    expect(store.status()).toBe('active');
  });

  it('el logout limpia el estado aunque el backend falle', () => {
    const { store } = create({ logout: vi.fn(() => throwError(() => new Error('offline'))) });
    store.restore().subscribe();

    store.logout().subscribe();

    expect(store.status()).toBe('anonymous');
    expect(store.me()).toBeNull();
  });

  it('un /auth/me que responde 401 deja la sesión como terminada', () => {
    const { store } = create({ me: vi.fn(() => throwError(() => unauthorized())) });

    store.restore().subscribe();

    expect(store.status()).toBe('revoked');
  });
});
