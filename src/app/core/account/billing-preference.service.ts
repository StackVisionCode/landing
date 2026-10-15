import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';

/** Versión del texto de consentimiento que se guarda server-side con el acuerdo del usuario. */
export const BILLING_PREFERENCE_CONSENT_VERSION = 'v1-2026-10';

export type BillingPreferenceMode = 'Automatic' | 'Manual';

/** Snapshot de la preferencia + info del método guardado (si lo hay). */
export interface BillingPreference {
  mode: BillingPreferenceMode;
  providerCode?: string | null;
  hasActiveMandate: boolean;
  acceptedAtUtc?: string | null;
  agreedAmountCents?: number | null;
  agreedCurrency?: string | null;
  agreedCadence?: string | null;
  defaultPaymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
}

export interface SetBillingPreferenceRequest {
  mode: BillingPreferenceMode;
  providerCode?: string;
  consentText: string;
  consentTextVersion: string;
}

/** Setup-only checkout: NO cobra. Devuelve la URL del proveedor para capturar/reemplazar la tarjeta. */
export interface PaymentMethodSetupSession {
  checkoutUrl: string;
  expiresAtUtc: string;
}

/**
 * `/subscriptions/me/billing-preference` del service de suscripción. El backend captura IP y UserAgent
 * server-side; el navegador solo manda el texto exacto que vio el usuario — la misma copia que la UI mostró.
 */
@Injectable({ providedIn: 'root' })
export class BillingPreferenceService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;

  get(): Observable<BillingPreference> {
    return this.http.get<BillingPreference>(`${this.base}/subscriptions/me/billing-preference`);
  }

  set(request: SetBillingPreferenceRequest): Observable<BillingPreference> {
    return this.http.post<BillingPreference>(
      `${this.base}/subscriptions/me/billing-preference`,
      request,
    );
  }

  /** Abre un Checkout en modo setup — captura/actualiza la tarjeta SIN cobrar.
   *  Mandamos el email desde el store porque el token de step-up puede llegar sin claim "email". */
  startSetupSession(
    successUrl: string,
    cancelUrl: string,
    payerEmail: string | null,
  ): Observable<PaymentMethodSetupSession> {
    return this.http.post<PaymentMethodSetupSession>(
      `${this.base}/subscriptions/me/payment-method/setup-session`,
      { payerEmail, successUrl, cancelUrl },
    );
  }
}
