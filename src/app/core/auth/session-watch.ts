import { DestroyRef, Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AccountSessionService } from './account-session.service';
import { AccountSessionStore } from './account-session.store';

/** Cada cuánto se comprueba que la sesión sigue viva mientras la pestaña está a la vista. */
const INTERVAL_MS = 60_000;

/**
 * Se da cuenta de que la sesión murió en otro lado —un takeover desde el espacio de trabajo, un logout
 * global— sin esperar a que el usuario haga algo. Antes solo se enteraba en la siguiente llamada: quien
 * dejaba el Account abierto seguía viendo una pantalla que ya no valía hasta recargar.
 *
 * Es un latido corto contra `/auth/me`, no un socket: Communication rechaza a propósito los tokens de esta
 * superficie, así que el canal en vivo del CRM y del portal no está disponible acá. El 401 lo resuelve el
 * interceptor —rota el token, y si la sesión ya no existe la marca revocada—, así que este servicio no
 * interpreta errores: solo pregunta.
 *
 * Al volver a la pestaña pregunta enseguida, que es justo cuando el usuario mira.
 */
@Injectable()
export class SessionWatch implements OnDestroy {
  private readonly api = inject(AccountSessionService);
  private readonly session = inject(AccountSessionStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.check();
    }
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(): void {
    if (!this.isBrowser || this.timerId !== null) {
      return;
    }
    this.timerId = setInterval(() => this.check(), INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.isBrowser) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private check(): void {
    // Con la pestaña oculta no hay nadie mirando; se retoma al volver.
    if (!this.session.isSignedIn() || document.visibilityState !== 'visible') {
      return;
    }
    this.api.me().subscribe({ error: () => undefined });
  }
}
