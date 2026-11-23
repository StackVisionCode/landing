import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AccountSessionExpiryService } from './account-session-expiry.service';
import { AccountSessionStore } from './account-session.store';
import { SessionActivityService } from './session-activity.service';
import { SessionPolicyService } from './session-policy.service';

describe('AccountSessionExpiryService', () => {
  const status = signal<'active' | 'anonymous' | 'revoked'>('active');
  const store = { status, endForInactivity: vi.fn(() => of(void 0)) };
  let service: AccountSessionExpiryService;
  const idleFor = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
  /** Justo pasada la inactividad por defecto (30 min) y antes de que venza el aviso (60 s). */
  const IDLE_JUST_PAST = 30 * 60_000 + 20_000;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    status.set('active');
    store.endForInactivity.mockClear();
    TestBed.configureTestingModule({
      providers: [
        AccountSessionExpiryService,
        SessionActivityService,
        { provide: AccountSessionStore, useValue: store },
        { provide: SessionPolicyService, useValue: { refreshIfStale: () => undefined } },
      ],
    });
    service = TestBed.inject(AccountSessionExpiryService);
    service.start();
  });

  afterEach(() => {
    service.stop();
    TestBed.inject(SessionActivityService).ngOnDestroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('muestra el aviso pasada la inactividad de la política', () => {
    idleFor(IDLE_JUST_PAST);
    vi.advanceTimersByTime(10_000);

    expect(service.state()).toMatchObject({ show: true, totalSeconds: 60 });
  });

  it('la cuenta atrás vence por reloj y cierra la sesión', () => {
    idleFor(IDLE_JUST_PAST);
    vi.advanceTimersByTime(10_000);
    vi.setSystemTime(new Date(Date.now() + 61_000));
    vi.advanceTimersByTime(1_000);

    expect(store.endForInactivity).toHaveBeenCalledOnce();
    expect(service.state().show).toBe(false);
  });

  it('"Seguir conectado" cierra el aviso y cuenta como actividad', () => {
    idleFor(IDLE_JUST_PAST);
    vi.advanceTimersByTime(10_000);

    service.stay();

    expect(service.state().show).toBe(false);
    expect(TestBed.inject(SessionActivityService).isPastIdleLimit()).toBe(false);
  });

  it('sin sesión activa no avisa', () => {
    status.set('anonymous');
    idleFor(IDLE_JUST_PAST);
    vi.advanceTimersByTime(10_000);

    expect(service.state().show).toBe(false);
  });
});
