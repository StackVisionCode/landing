import { Component, computed, inject } from '@angular/core';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { OfficeBrandingStore } from '@core/account/office-branding.store';
import { officeWorkspaceUrl } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Oficina y cuenta: lo que identifica la suscripción, en solo lectura. Los datos y la marca se editan en
 * el espacio de trabajo, así que acá no hay formulario.
 */
@Component({
  selector: 'app-account-office',
  templateUrl: './account-office.component.html',
})
export class AccountOfficeComponent {
  private readonly session = inject(AccountSessionStore);
  private readonly branding = inject(OfficeBrandingStore);
  private readonly i18n = inject(TranslationStore);

  readonly t = this.i18n.t;
  readonly me = this.session.me;
  readonly logoUrl = this.branding.logoUrl;

  readonly adminName = computed(() => {
    const me = this.me();
    return me ? `${me.name} ${me.lastName}`.trim() : '';
  });

  readonly workspaceUrl = computed(() => {
    const slug = this.me()?.tenant.subDomain;
    return slug ? officeWorkspaceUrl(slug) : null;
  });

  constructor() {
    this.branding.load();
  }

  initials(): string {
    return this.branding.initials();
  }
}
