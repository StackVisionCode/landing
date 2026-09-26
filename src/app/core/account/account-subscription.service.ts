import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import {
  RenewCheckoutStatus,
  StartRenewCheckoutRequest,
  StartRenewCheckoutResponse,
  AccountSubscription,
  AddOnCheckoutStatus,
  ChangePlanRequest,
  ChangePlanResponse,
  PlanChangePreview,
  ReceiptDownloadUrl,
  SaaSPaymentsPage,
  PagedSeats,
  SeatCheckoutStatus,
  SeatQuote,
  StartAddOnCheckoutRequest,
  StartAddOnCheckoutResponse,
  StartSeatCheckoutRequest,
  StartSeatCheckoutResponse,
  TenantLimits,
} from './account-subscription.models';

/** Datos de la suscripción para el Account. El token lo pone el interceptor. */
@Injectable({ providedIn: 'root' })
export class AccountSubscriptionService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;

  /** Plan contratado, período, cambio pendiente, asientos y add-ons, en una sola llamada. */
  get(): Observable<AccountSubscription> {
    return this.http.get<AccountSubscription>(`${this.base}/subscriptions/me/account`);
  }

  /** Solo Auth sabe cuántos usuarios activos hay: es el "usados" de los asientos. */
  limits(): Observable<TenantLimits> {
    return this.http.get<TenantLimits>(`${this.base}/auth/tenants/limits`);
  }

  /** Asientos comprados, con su asignación. Los que trae el plan no son filas: salen del read model. */
  seats(): Observable<PagedSeats> {
    return this.http.get<PagedSeats>(`${this.base}/seats?page=1&pageSize=100`);
  }

  /** Cotización server-side: el prorrateo al período en curso lo calcula el backend. */
  seatQuote(seatType: string, quantity: number): Observable<SeatQuote> {
    return this.http.get<SeatQuote>(`${this.base}/seats/quote?seatType=${seatType}&quantity=${quantity}`);
  }

  /** Abre (o retoma) el checkout hosteado de asientos. */
  startSeatCheckout(request: StartSeatCheckoutRequest): Observable<StartSeatCheckoutResponse> {
    return this.http.post<StartSeatCheckoutResponse>(`${this.base}/seats/checkout`, request);
  }

  seatCheckoutStatus(intentId: string): Observable<SeatCheckoutStatus> {
    return this.http.get<SeatCheckoutStatus>(`${this.base}/seats/checkout/${intentId}`);
  }

  /** Compra de un add-on por checkout hosteado; el backend rechaza lo ya incluido o ya activo. */
  startAddOnCheckout(request: StartAddOnCheckoutRequest): Observable<StartAddOnCheckoutResponse> {
    return this.http.post<StartAddOnCheckoutResponse>(`${this.base}/addons/checkout`, request);
  }

  addOnCheckoutStatus(intentId: string): Observable<AddOnCheckoutStatus> {
    return this.http.get<AddOnCheckoutStatus>(`${this.base}/addons/checkout/${intentId}`);
  }

  /**
   * Pide el cambio de plan. Exige confirmar la contraseña (401 `Auth.ReauthenticationRequired`). Un upgrade
   * responde 202 y el plan cambia recién cuando se cobra; un downgrade responde 204 y queda agendado.
   */
  changePlan(request: ChangePlanRequest): Observable<ChangePlanResponse | null> {
    return this.http.post<ChangePlanResponse | null>(`${this.base}/subscriptions/change-plan`, request);
  }

  /** Vista previa server-side: el total que se muestra es el que se cobra. */
  planChangePreview(planCode: string, billingCycle?: string | null): Observable<PlanChangePreview> {
    const cycle = billingCycle ? `&billingCycle=${encodeURIComponent(billingCycle)}` : '';
    return this.http.get<PlanChangePreview>(
      `${this.base}/subscriptions/change-plan/preview?planCode=${encodeURIComponent(planCode)}${cycle}`
    );
  }

  /** Historial de pagos del tenant, el más reciente primero. */
  payments(page = 1, pageSize = 25): Observable<SaaSPaymentsPage> {
    return this.http.get<SaaSPaymentsPage>(`${this.base}/payments-app/saas-payments?page=${page}&pageSize=${pageSize}`);
  }

  /** URL firmada del recibo. El backend valida que el pago es de este tenant antes de firmarla. */
  receiptUrl(paymentId: string): Observable<ReceiptDownloadUrl> {
    return this.http.get<ReceiptDownloadUrl>(`${this.base}/payments-app/saas-payments/${paymentId}/receipt`);
  }

  /**
   * Cancela al fin del período: no corta nada ahora ni reembolsa (D7). Exige confirmar la contraseña
   * (401 `Auth.ReauthenticationRequired`).
   */
  cancelSubscription(reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/subscriptions/cancel`, { reason });
  }

  /** Deshace la cancelación programada. No cobra nada. */
  /** Renovar a mano una suscripción vencida: devuelve la URL del proveedor. */
  startRenewCheckout(request: StartRenewCheckoutRequest): Observable<StartRenewCheckoutResponse> {
    return this.http.post<StartRenewCheckoutResponse>(`${this.base}/subscriptions/me/renew-checkout`, request);
  }

  renewCheckoutStatus(intentId: string): Observable<RenewCheckoutStatus> {
    return this.http.get<RenewCheckoutStatus>(`${this.base}/subscriptions/me/renew-checkout/${intentId}`);
  }

  resumeSubscription(): Observable<void> {
    return this.http.post<void>(`${this.base}/subscriptions/resume`, {});
  }

  /** Deshace un downgrade agendado. Un upgrade no se cancela: se resuelve solo con el cobro. */
  cancelPendingPlanChange(): Observable<void> {
    return this.http.post<void>(`${this.base}/subscriptions/plan-change/cancel`, {});
  }
}
