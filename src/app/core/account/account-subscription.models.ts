/** Contratos de `GET /subscriptions/me/account` y `GET /auth/tenants/limits`. Los montos vienen en centavos. */

/** El plan tal como se contrató, no el del catálogo de hoy. */
export interface AccountPlan {
  code: string;
  name: string;
  status: string;
  billingCycle: string;
  currentCyclePriceCents: number;
  currency: string;
  enabledModules: string[];
  billingAccessBlocked: boolean;
}

export interface AccountPeriod {
  currentPeriodStartUtc: string;
  currentPeriodEndUtc: string;
  nextRenewalAtUtc: string | null;
  trialEndsAtUtc: string | null;
  gracePeriodEndsAtUtc: string | null;
  /** Cancelación programada: el acceso llega hasta `currentPeriodEndUtc` y se puede deshacer. */
  cancelAtPeriodEnd: boolean;
  cancelledAtUtc: string | null;
}

/** Cambio de plan pedido y todavía sin aplicar. `Upgrade` cobra; `Downgrade` entra al renovar. */
export interface AccountPendingPlanChange {
  kind: 'Upgrade' | 'Downgrade';
  id: string;
  fromPlanCode: string;
  toPlanCode: string;
  toBillingCycle: string | null;
  status: string;
  requestedAtUtc: string;
  effectiveAtUtc: string | null;
  chargeAmountCents: number | null;
  chargeCurrency: string | null;
  /** Solo en un upgrade que se está cobrando por redirect y cuya sesión sigue viva: se puede retomar. */
  checkoutUrl: string | null;
}

export interface AccountSeats {
  includedInPlan: number;
  purchased: number;
  total: number;
}

export type AddOnEligibility = 'Included' | 'Active' | 'Available';

export interface AccountAddOn {
  code: string;
  name: string;
  description: string;
  category: string;
  eligibility: AddOnEligibility;
  unitAmountCents: number | null;
  currency: string | null;
  tenantAddOnId: string | null;
  currentPeriodEndUtc: string | null;
  autoRenew: boolean | null;
}

/** Compra de asientos a medias que todavía se puede pagar: mientras exista, no se abre otra. */
export interface AccountOpenSeatCheckout {
  intentId: string;
  seatType: string;
  quantity: number;
  totalCents: number;
  currency: string;
  checkoutUrl: string;
  expiresAtUtc: string;
}

export interface AccountSubscription {
  plan: AccountPlan;
  period: AccountPeriod;
  pendingPlanChange: AccountPendingPlanChange | null;
  seats: AccountSeats;
  addOns: AccountAddOn[];
  openSeatCheckout: AccountOpenSeatCheckout | null;
}

/** Cuerpo de `POST /subscriptions/me/renew-checkout`: renovar a mano una suscripción vencida. */
export interface StartRenewCheckoutRequest {
  payerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StartRenewCheckoutResponse {
  renewalIntentId: string;
  checkoutUrl: string;
  paymentId: string;
  expiresAtUtc: string;
}

/** `GET /subscriptions/me/renew-checkout/{id}`: el front lo pollea al volver del proveedor. */
export interface RenewCheckoutStatus {
  renewalIntentId: string;
  status: string;
  amountCents: number;
  currency: string;
  checkoutUrl: string | null;
}

/** Fila de `GET /seats`: un asiento comprado y a quién está asignado. */
export interface Seat {
  id: string;
  type: string;
  status: string;
  currentUserId: string | null;
  nextRenewalAtUtc: string | null;
  autoRenew: boolean;
}

export interface PagedSeats {
  items: Seat[];
  totalCount: number;
}

/** `GET /seats/quote`: el total lo calcula el backend, nunca el navegador. */
export interface SeatQuote {
  seatType: string;
  quantity: number;
  billingCycle: string;
  unitAmountCents: number;
  proratedUnitAmountCents: number;
  proratedTotalCents: number;
  currency: string;
  currentPeriodEndUtc: string;
}

/** Cuerpo de `POST /seats/checkout`. */
export interface StartSeatCheckoutRequest {
  seatType: string;
  quantity: number;
  autoRenew: boolean;
  payerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StartSeatCheckoutResponse {
  seatPurchaseIntentId: string;
  checkoutUrl: string;
  paymentId: string;
  expiresAtUtc: string;
}

/** `GET /seats/checkout/{id}`: al volver del proveedor se pollea hasta que el webhook aprovisiona. */
export interface SeatCheckoutStatus {
  seatPurchaseIntentId: string;
  status: string;
  seatType: string;
  quantity: number;
  proratedTotalCents: number;
  currency: string;
  checkoutUrl: string | null;
}

/** Cuerpo de `POST /addons/checkout`. */
export interface StartAddOnCheckoutRequest {
  addOnCode: string;
  quantity: number;
  autoRenew: boolean;
  payerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

/** `GET /addons/checkout/{id}`: al volver del proveedor se pollea hasta que el webhook activa el add-on. */
export interface AddOnCheckoutStatus {
  addOnPurchaseIntentId: string;
  status: string;
  addOnCode: string;
  quantity: number;
  proratedTotalCents: number;
  currency: string;
  checkoutUrl: string | null;
}

export interface StartAddOnCheckoutResponse {
  addOnPurchaseIntentId: string;
  checkoutUrl: string;
  paymentId: string;
  expiresAtUtc: string;
}

/** Cuerpo de `POST /subscriptions/change-plan`. Sin ciclo se mantiene el actual. */
export interface ChangePlanRequest {
  planCode: string;
  billingCycle?: string | null;
  /** Con email y URLs de retorno el upgrade se cobra por checkout; sin ellas, off-session. */
  payerEmail?: string | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
}

/**
 * 202 con `PaymentProcessing` cuando es un upgrade (el plan NO cambió todavía: falta el cobro); 204 sin
 * cuerpo cuando es un downgrade agendado o un cambio sin diferencia de precio.
 */
export interface ChangePlanResponse {
  status: string;
  planChangeRequestId: string | null;
  /** A dónde mandar al usuario a pagar el upgrade. Null cuando el cobro fue off-session. */
  checkoutUrl: string | null;
}

/**
 * `GET /subscriptions/change-plan/preview`: qué pasaría si se confirma, antes de confirmarlo. El backend
 * decide la dirección y el total; la pantalla solo lo muestra.
 */
export interface PlanChangePreview {
  direction: 'Upgrade' | 'Downgrade' | 'None';
  toPlanCode: string;
  toPlanName: string;
  billingCycle: string;
  amountCents: number;
  currency: string;
  currentAmountCents: number;
  chargedNow: boolean;
  effectiveAtUtc: string | null;
  seatsAfterChange: number;
  occupiedSeats: number | null;
  blocked: boolean;
  blockedReason: string | null;
}

/** Una línea del historial de pagos (`GET /payments-app/saas-payments`). Los montos vienen en centavos. */
export interface SaaSPaymentRow {
  id: string;
  status: string;
  type: string;
  amountCents: number;
  currency: string;
  refundedAmountCents: number;
  providerCode: string;
  paidAtUtc: string | null;
  createdAtUtc: string;
  /** El PDF se genera después del cobro: hasta que esté, no hay nada que descargar. */
  hasReceipt: boolean;
}

/** `GET /payments-app/saas-payments/{id}/receipt`: URL firmada, de vida corta. */
export interface ReceiptDownloadUrl {
  downloadUrl: string;
  expiresAtUtc: string;
}

export interface SaaSPaymentsPage {
  items: SaaSPaymentRow[];
  totalCount: number;
}

/** `GET /auth/tenants/limits` — de acá sale el único dato que Subscription no tiene: los asientos en uso. */
export interface TenantLimits {
  planCode: string | null;
  maxUsers: number | null;
  activeUsers: number;
  pendingInvitations: number;
  availableSeats: number | null;
}
