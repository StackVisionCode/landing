import { Injectable, computed, inject, signal } from '@angular/core';
import { AccountSessionService } from '@core/auth/account-session.service';
import { AccountSessionStore } from '@core/auth/account-session.store';

/**
 * Logo de la oficina. Sale del endpoint **anónimo** de marca —el mismo que pinta el login, y que solo
 * sirve assets ya escaneados—, así que no hace falta abrirle la superficie del Account a Tenant.
 *
 * Vive acá y no en cada pantalla porque la cabecera y "Office" muestran el mismo logo: se pide una vez por
 * oficina y las dos leen la misma señal. Es decorativo: si falla, quedan las iniciales.
 */
@Injectable({ providedIn: 'root' })
export class OfficeBrandingStore {
  private readonly api = inject(AccountSessionService);
  private readonly session = inject(AccountSessionStore);

  private readonly _logoUrl = signal<string | null>(null);
  private requestedSlug: string | null = null;

  readonly logoUrl = this._logoUrl.asReadonly();

  /** Iniciales de la oficina, que es lo que se ve mientras no hay logo (o si no lo hay). */
  readonly initials = computed(() => (this.session.me()?.tenant.name ?? '').trim().slice(0, 2).toUpperCase());

  load(): void {
    const slug = this.session.me()?.tenant.subDomain;
    if (!slug || slug === this.requestedSlug) {
      return;
    }
    this.requestedSlug = slug;
    this.api.officeBranding(slug).subscribe({
      next: branding => this._logoUrl.set(branding.logoUrl ? this.api.assetUrl(branding.logoUrl) : null),
      error: () => this._logoUrl.set(null),
    });
  }
}
