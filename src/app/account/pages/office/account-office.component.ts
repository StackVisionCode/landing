import { Component, computed, inject, signal } from '@angular/core';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { OfficeBrandingStore } from '@core/account/office-branding.store';
import {
  OfficeProfile,
  OfficeProfileAddress,
  OfficeProfileService,
} from '@core/account/office-profile.service';
import { officeWorkspaceUrl } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';

/** Ruta del CRM donde se editan los datos de la oficina. */
const COMPANY_SETTINGS_PATH = '/company/settings';

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
  private readonly profileApi = inject(OfficeProfileService);
  private readonly i18n = inject(TranslationStore);

  readonly t = this.i18n.t;
  readonly me = this.session.me;
  readonly logoUrl = this.branding.logoUrl;

  readonly profileLoading = signal(true);
  readonly profileFailed = signal(false);
  readonly profile = signal<OfficeProfile | null>(null);

  readonly adminName = computed(() => {
    const me = this.me();
    return me ? `${me.name} ${me.lastName}`.trim() : '';
  });

  readonly workspaceUrl = computed(() => {
    const slug = this.me()?.tenant.subDomain;
    return slug ? officeWorkspaceUrl(slug) : null;
  });

  readonly settingsUrl = computed(() => {
    const slug = this.me()?.tenant.subDomain;
    return slug ? officeWorkspaceUrl(slug, COMPANY_SETTINGS_PATH) : null;
  });

  readonly legalName = computed(() => this.profile()?.legalName?.trim() || null);
  readonly ein = computed(() => this.profile()?.ein?.trim() || null);

  /** Dirección del recibo: la postal si la oficina tiene una distinta, si no la física. */
  readonly billingAddressLines = computed(() => {
    const profile = this.profile();
    if (!profile) {
      return [];
    }
    const mailing =
      profile.mailingSameAsPhysical === false ? addressLines(profile.mailingAddress) : [];
    return mailing.length ? mailing : addressLines(profile.physicalAddress);
  });

  /** Lo que falta para que el recibo salga completo, con las mismas etiquetas del bloque. */
  readonly missingFields = computed(() => {
    const t = this.t();
    const missing: string[] = [];
    if (!this.legalName()) missing.push(t.accOfficeBillingLegalNameLabel);
    if (!this.ein()) missing.push(t.accOfficeBillingEinLabel);
    if (!this.billingAddressLines().length) missing.push(t.accOfficeBillingAddressLabel);
    return missing;
  });

  constructor() {
    this.branding.load();
    this.loadProfile();
  }

  loadProfile(): void {
    this.profileLoading.set(true);
    this.profileFailed.set(false);
    this.profileApi.get().subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.profileLoading.set(false);
      },
      error: () => {
        this.profileFailed.set(true);
        this.profileLoading.set(false);
      },
    });
  }

  initials(): string {
    return this.branding.initials();
  }
}

/** Líneas de una dirección; vacía si no tiene al menos calle y ciudad (no sirve para un recibo). */
function addressLines(address: OfficeProfileAddress | null): string[] {
  const line1 = address?.line1?.trim();
  const city = address?.city?.trim();
  if (!address || !line1 || !city) {
    return [];
  }
  const region = [address.state?.trim(), address.postalCode?.trim()].filter(Boolean).join(' ');
  const country = address.country?.trim();
  return [
    line1,
    address.line2?.trim() ?? '',
    [city, region].filter(Boolean).join(', '),
    // El país solo se muestra si no es EE. UU.
    country && country.toUpperCase() !== 'US' ? country : '',
  ].filter(Boolean);
}
