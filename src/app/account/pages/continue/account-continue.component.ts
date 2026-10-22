import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { safeAccountReturnUrl } from '@core/auth/account-return-url';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { SITE_CONFIG } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Aterrizaje de "Manage subscription" del CRM: canjea el vale de un solo uso por la sesión del Account.
 * El vale dura 60 s y sirve una vez, así que recargar esta URL falla a propósito.
 */
@Component({
  selector: 'app-account-continue',
  templateUrl: './account-continue.component.html',
  styles: `
    .continue-failed {
      animation: continue-failed-in 240ms ease-out both;
    }
    @keyframes continue-failed-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .continue-failed { animation: none; }
    }
  `,
})
export class AccountContinueComponent {
  private readonly session = inject(AccountSessionStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationStore);

  readonly t = this.i18n.t;
  readonly workspaceUrl = SITE_CONFIG.appUrl;
  readonly failed = signal(false);

  /** Lemniscata del loader de marca: dos lazos unidos en el centro (32,16). */
  readonly path =
    'M32 16 C24 4 14 4 10 4 C5 4 2 9 2 16 C2 23 5 28 10 28 C14 28 24 28 32 16 C40 4 50 4 54 4 C59 4 62 9 62 16 C62 23 59 28 54 28 C50 28 40 28 32 16 Z';

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const ticket = params.get('ticket');
    if (!ticket) {
      this.failed.set(true);
      return;
    }
    // El espacio de trabajo dice a qué sección venía: "Add seats" aterriza en Seats, no en el resumen.
    const returnUrl = safeAccountReturnUrl(params.get('returnUrl'));
    this.session.startFromHandoff(ticket).subscribe({
      // `replaceUrl`: el vale queda en el historial y ya no sirve; volver atrás no debe reintentarlo.
      next: () => void this.router.navigateByUrl(returnUrl, { replaceUrl: true }),
      error: () => this.failed.set(true),
    });
  }
}
