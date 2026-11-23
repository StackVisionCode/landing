import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** Política de sesión de la plataforma (`GET /auth/session-policy`). La cambia PlatformAdmin. */
export interface SessionPolicy {
  idleTimeoutMinutes: number;
  warningSeconds: number;
  absoluteLifetimeHours: number;
}

/** Mientras no llega la del servidor: los mismos valores por defecto que Auth. */
export const DEFAULT_SESSION_POLICY: SessionPolicy = { idleTimeoutMinutes: 30, warningSeconds: 60, absoluteLifetimeHours: 12 };

/** Última actividad compartida entre pestañas del mismo navegador. */
export const SESSION_ACTIVITY_KEY = 'tva.session.lastActivityAt';
const CHANNEL = 'tv-account-auth';
const LOGOUT_MESSAGE = 'logout';
/** Escribir en localStorage en cada tecla sería un desperdicio: con 5 s alcanza para un reloj de minutos. */
const WRITE_EVERY_MS = 5_000;

function readStored(): number {
  try {
    const value = Number(localStorage.getItem(SESSION_ACTIVITY_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * Un solo reloj de inactividad para todas las pestañas, la política vigente y el aviso de "salí" entre pestañas.
 *
 * - La actividad se guarda en localStorage: usar la app en una pestaña mantiene viva la sesión en las demás, y
 *   "Mantener la sesión" en una cierra el aviso en todas.
 * - Al salir, se avisa por `BroadcastChannel`: las otras pestañas también salen. Antes cada una seguía con su
 *   token en memoria y una renovación en vuelo podía resucitar la sesión ("Log out no me saca").
 * - `isPastIdleLimit` es la regla que usa `AuthService.refresh`: pasado inactividad + aviso, nadie renueva (ni el
 *   socket, ni un 401 de un sondeo). Así una pestaña oculta ya no mantiene la sesión viva indefinidamente.
 *
 * Sin `inject()`: no depende de nadie, para que lo usen AuthService y SessionExpiryService sin ciclos.
 */
@Injectable({ providedIn: 'root' })
export class SessionActivityService implements OnDestroy {
  private policy: SessionPolicy = DEFAULT_SESSION_POLICY;
  /** Abrir la app cuenta como actividad. */
  private localActivityAt = Date.now();
  private lastWriteAt = 0;

  private readonly otherTabLogout = new Subject<void>();
  readonly otherTabLogout$: Observable<void> = this.otherTabLogout.asObservable();

  private readonly channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);

  private readonly onMessage = (event: MessageEvent) => {
    if (event.data === LOGOUT_MESSAGE) {
      this.otherTabLogout.next();
    }
  };

  constructor() {
    this.channel?.addEventListener('message', this.onMessage);
  }

  ngOnDestroy(): void {
    this.channel?.removeEventListener('message', this.onMessage);
    this.channel?.close();
  }

  /** Aplica la política del servidor; ignora valores fuera de los rangos que valida Auth. */
  applyPolicy(policy: SessionPolicy): void {
    const valid =
      policy.idleTimeoutMinutes >= 5 &&
      policy.idleTimeoutMinutes <= 240 &&
      policy.warningSeconds >= 30 &&
      policy.warningSeconds <= 300 &&
      policy.warningSeconds < policy.idleTimeoutMinutes * 60;
    if (valid) {
      this.policy = { ...policy };
    }
  }

  idleMs(): number {
    return this.policy.idleTimeoutMinutes * 60_000;
  }

  warningSeconds(): number {
    return this.policy.warningSeconds;
  }

  lastActivityAt(): number {
    return Math.max(this.localActivityAt, readStored());
  }

  /** Interacción real del usuario. `force` escribe ya (p. ej. "Mantener la sesión"). */
  markActivity(force = false): void {
    const now = Date.now();
    this.localActivityAt = now;
    if (force || now - this.lastWriteAt >= WRITE_EVERY_MS) {
      this.lastWriteAt = now;
      try {
        localStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
      } catch {
        // Sin almacenamiento (modo privado estricto): el reloj sigue valiendo para esta pestaña.
      }
    }
  }

  /** Pasaron inactividad + aviso: la sesión ya no debe renovarse. */
  isPastIdleLimit(): boolean {
    return Date.now() - this.lastActivityAt() >= this.idleMs() + this.policy.warningSeconds * 1000;
  }

  /** Esta pestaña salió: las demás también. */
  broadcastLogout(): void {
    this.channel?.postMessage(LOGOUT_MESSAGE);
    try {
      localStorage.removeItem(SESSION_ACTIVITY_KEY);
    } catch {
      // Nada que limpiar.
    }
  }
}
