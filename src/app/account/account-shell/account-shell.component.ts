import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SITE_CONFIG } from '@core/config/site-config';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountSubscriptionStore } from '@core/account/account-subscription.store';
import { OfficeBrandingStore } from '@core/account/office-branding.store';
import { SessionWatch } from '@core/auth/session-watch';
import { TranslationStore } from '@core/i18n/translation.store';
import { AccountExpiryBannerComponent } from '../shared/account-expiry-banner.component';

/**
 * Marco del Account: cabecera con la oficina, navegación lateral (barra inferior en móvil) y el outlet.
 * El guard ya garantizó sesión de administrador; acá solo se reacciona si la sesión muere en vivo.
 */
@Component({
  selector: 'app-account-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AccountExpiryBannerComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [SessionWatch],
  templateUrl: './account-shell.component.html',
})
export class AccountShellComponent {
  private readonly session = inject(AccountSessionStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationStore);
  private readonly branding = inject(OfficeBrandingStore);
  private readonly subscription = inject(AccountSubscriptionStore);
  private readonly watch = inject(SessionWatch);

  readonly t = this.i18n.t;
  readonly workspaceUrl = SITE_CONFIG.appUrl;
  readonly isMenuOpen = signal(false);
  readonly signingOut = signal(false);

  readonly officeName = computed(() => this.session.me()?.tenant.name ?? '');
  readonly officeLogo = this.branding.logoUrl;
  readonly officeInitials = this.branding.initials;

  readonly links = [
    { path: '.', exact: true, icon: 'speedometer-outline', label: () => this.t().accNavOverview },
    { path: 'plan', exact: false, icon: 'layers-outline', label: () => this.t().accNavPlan },
    { path: 'seats', exact: false, icon: 'people-outline', label: () => this.t().accNavSeats },
    { path: 'add-ons', exact: false, icon: 'extension-puzzle-outline', label: () => this.t().accNavAddOns },
    { path: 'billing', exact: false, icon: 'receipt-outline', label: () => this.t().accNavBilling },
    { path: 'office', exact: false, icon: 'business-outline', label: () => this.t().accNavOffice },
  ];

  /** Los mismos enlaces agrupados por sección (SUBSCRIPTION / BILLING / OFFICE) para el menú lateral. */
  readonly groups = computed(() => [
    { id: 'subscription', label: () => this.t().accNavGroupSubscription, links: this.links.slice(0, 4) },
    { id: 'billing', label: () => this.t().accNavGroupBilling, links: this.links.slice(4, 5) },
    { id: 'office', label: () => this.t().accNavGroupOffice, links: this.links.slice(5) },
  ]);

  constructor() {
    this.branding.load();
    // Snapshot compartido para el banner global; las sub-páginas pueden refrescarlo tras acciones.
    this.subscription.load();
    // Si la sesión muere en otro lado, que se note sin tener que recargar.
    this.watch.start();

    // La sesión puede morir mientras el usuario está adentro (takeover, logout global, baja del usuario).
    effect(() => {
      if (this.session.status() === 'revoked') {
        void this.router.navigate(['/account/session-ended']);
      }
    });
  }

  toggleMenu(): void {
    this.isMenuOpen.update(open => !open);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  signOut(): void {
    this.signingOut.set(true);
    this.session.logout().subscribe(() => {
      this.signingOut.set(false);
      void this.router.navigate(['/account/sign-in']);
    });
  }
}
