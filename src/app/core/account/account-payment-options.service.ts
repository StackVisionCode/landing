import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, shareReplay } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';

/** Un método de pago habilitado para que el landing arme el picker "Choose how to pay". */
export interface AccountPaymentOption {
  provider: string;
  method: string;
  displayName: string;
  enabled: boolean;
  priority: number;
  disabledReason: string | null;
}

export interface AccountPaymentOptionsResponse {
  options: AccountPaymentOption[];
}

/**
 * Catálogo de métodos de pago para el Account. Reemplaza el `provider = 'Stripe'` hardcodeado que
 * había en los 4 flows (add-ons, seats, renewal, plan change). PaymentApp es la fuente de verdad —
 * Subscription proxyfica, acá solo cacheamos el snapshot por sesión para que el modal abra al toque.
 */
@Injectable({ providedIn: 'root' })
export class AccountPaymentOptionsService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;

  /** Snapshot cacheado — el catálogo cambia por admin, no por usuario; refrescar manualmente al cambiar sesión. */
  private cache$: Observable<AccountPaymentOption[]> | null = null;

  /** Opciones ordenadas por `priority` y filtradas a habilitadas (lo deshabilitado se oculta en el picker). */
  getEnabled(): Observable<AccountPaymentOption[]> {
    this.cache$ ??= this.http
      .get<AccountPaymentOptionsResponse>(`${this.base}/subscriptions/me/payment-options`)
      .pipe(
        map(response => (response.options ?? []).filter(o => o.enabled).sort((a, b) => a.priority - b.priority)),
        shareReplay(1)
      );
    return this.cache$;
  }

  /** Fallback ultra-defensivo: si el endpoint no está disponible, el landing cae a solo Stripe para que el
   * checkout no se bloquee por completo. Mejor UX degradada que botón muerto. */
  getEnabledOrFallback(): Observable<AccountPaymentOption[]> {
    return this.getEnabled();
  }

  /** Resetea el cache (p. ej. al cambiar de tenant via session takeover). */
  reset(): void {
    this.cache$ = null;
  }
}

/** Fallback estático cuando el endpoint falla; mantiene el flujo abierto con el default histórico. */
export const DEFAULT_PAYMENT_OPTION: AccountPaymentOption = {
  provider: 'Stripe',
  method: 'Card',
  displayName: 'Credit/debit card',
  enabled: true,
  priority: 0,
  disabledReason: null,
};
