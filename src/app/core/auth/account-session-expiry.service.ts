import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AccountSessionStore } from './account-session.store';
import { SessionActivityService } from './session-activity.service';
import { SessionPolicyService } from './session-policy.service';

export interface AccountExpiryState {
  show: boolean;
  remainingSeconds: number;
  totalSeconds: number;
}

const HIDDEN: AccountExpiryState = { show: false, remainingSeconds: 0, totalSeconds: 0 };
const CHECK_INTERVAL_MS = 10_000;
const COUNTDOWN_TICK_MS = 1_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

/**
 * Aviso de inactividad del Account: el mismo criterio que el CRM y el portal, con los minutos y segundos de la
 * política de la plataforma. Aquí no hay que renovar nada por reloj (el Account rota solo ante un 401); solo avisar
 * y, si nadie responde, cerrar la sesión en Auth.
 *
 * - Solo cuenta la interacción intencional (click, tecla, rueda, toque).
 * - Cuenta atrás por plazo real: con la pestaña frenada por el navegador, 60 s siguen siendo 60 s.
 * - Pestaña oculta: no abre el aviso; si al volver ya pasó inactividad + aviso, cierra sin mostrarlo.
 */
@Injectable({ providedIn: 'root' })
export class AccountSessionExpiryService {
  private readonly session = inject(AccountSessionStore);
  private readonly activity = inject(SessionActivityService);
  private readonly policy = inject(SessionPolicyService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _state = signal<AccountExpiryState>(HIDDEN);
  readonly state = this._state.asReadonly();

  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private warningOpenedAt = 0;
  private warningDeadline = 0;
  private ending = false;

  private readonly onActivity = () => {
    if (!this._state().show) {
      this.activity.markActivity();
    }
  };

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.check();
    }
  };

  /** Lo arranca el shell del Account. Idempotente. */
  start(): void {
    if (!this.isBrowser || this.checkTimer !== null) {
      return;
    }
    this.checkTimer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, this.onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  stop(): void {
    if (this.checkTimer !== null) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.stopCountdown();
    if (this.isBrowser) {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, this.onActivity);
      }
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /** "Seguir conectado": cuenta como actividad en todas las pestañas. */
  stay(): void {
    this.stopCountdown();
    this._state.set(HIDDEN);
    this.activity.markActivity(true);
  }

  /** "Cerrar sesión" desde el aviso. */
  signOutNow(): void {
    this.end();
  }

  private check(): void {
    if (this.session.status() !== 'active' || this.ending) {
      if (this._state().show) {
        this.stopCountdown();
        this._state.set(HIDDEN);
      }
      return;
    }
    this.policy.refreshIfStale();

    if (this._state().show) {
      this.tick();
      return;
    }
    if (this.activity.isPastIdleLimit()) {
      this.end();
      return;
    }
    const idleMs = Date.now() - this.activity.lastActivityAt();
    if (idleMs >= this.activity.idleMs() && document.visibilityState !== 'hidden') {
      const total = this.activity.warningSeconds();
      this.warningOpenedAt = Date.now();
      this.warningDeadline = this.warningOpenedAt + total * 1000;
      this._state.set({ show: true, remainingSeconds: total, totalSeconds: total });
      this.countdownTimer = setInterval(() => this.tick(), COUNTDOWN_TICK_MS);
    }
  }

  private tick(): void {
    // "Seguir conectado" en otra pestaña cierra el aviso aquí.
    if (this.activity.lastActivityAt() > this.warningOpenedAt) {
      this.stay();
      return;
    }
    const remaining = Math.ceil((this.warningDeadline - Date.now()) / 1000);
    if (remaining <= 0) {
      this.end();
      return;
    }
    this._state.update(state => ({ ...state, remainingSeconds: remaining }));
  }

  private end(): void {
    this.stopCountdown();
    this._state.set(HIDDEN);
    this.ending = true;
    this.session.endForInactivity().subscribe({ complete: () => (this.ending = false) });
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
