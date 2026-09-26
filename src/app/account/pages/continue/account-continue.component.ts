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
})
export class AccountContinueComponent {
  private readonly session = inject(AccountSessionStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationStore);

  readonly t = this.i18n.t;
  readonly workspaceUrl = SITE_CONFIG.appUrl;
  readonly failed = signal(false);

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
