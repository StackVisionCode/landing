import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SITE_CONFIG } from '@core/config/site-config';
import { SessionActivityService, SessionPolicy } from './session-activity.service';

/** Cada cuánto se vuelve a pedir: un cambio de PlatformAdmin llega al Account abierto en ese tiempo. */
const REFRESH_EVERY_MS = 15 * 60_000;

/**
 * Lee la política de sesión que fija PlatformAdmin (`GET /auth/session-policy`, también para la superficie
 * `account`) y se la pasa al reloj de inactividad. Si falla, sigue la última conocida: la defensa real está en Auth.
 */
@Injectable({ providedIn: 'root' })
export class SessionPolicyService {
  private readonly http = inject(HttpClient);
  private readonly activity = inject(SessionActivityService);
  private loadedAt = 0;
  private loading = false;

  refreshIfStale(): void {
    if (this.loading || Date.now() - this.loadedAt < REFRESH_EVERY_MS) {
      return;
    }
    this.loading = true;
    this.http.get<SessionPolicy>(`${SITE_CONFIG.apiUrl}/auth/session-policy`).subscribe({
      next: policy => {
        this.activity.applyPolicy(policy);
        this.loadedAt = Date.now();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }
}
