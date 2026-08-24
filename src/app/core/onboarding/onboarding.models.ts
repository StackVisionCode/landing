/**
 * Contratos exactos del flujo de onboarding "pago primero" (Auth service,
 * rutas /onboarding/* y /auth/onboarding/terms/*, gateway sin prefijo /api).
 * Verificado archivo:línea contra TaxVsion_BackEnd — no inventar campos.
 */

export interface CreateEmailChallengeRequest {
  email: string;
  firstNameHint?: string;
}

export interface CreateEmailChallengeResponse {
  challengeId: string;
}

export interface VerifyEmailChallengeRequest {
  code: string;
}

export type BillingCycle = 'Monthly' | 'Yearly';

export interface CreateOnboardingRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  planId: string;
  emailVerificationChallengeId: string;
  billingCycle?: BillingCycle;
}

export interface CreateOnboardingResponse {
  onboardingId: string;
  email: string;
  planId: string;
}

export interface StartCheckoutRequest {
  onboardingId: string;
  payerEmail: string;
  successUrl: string;
  cancelUrl: string;
  referralCode?: string;
  promoCode?: string;
  giftCode?: string;
}

export interface StartCheckoutResponse {
  paymentId: string;
  checkoutUrl: string;
  expiresAtUtc: string;
  fullyCovered: boolean;
  grossAmountCents?: number;
  discountAmountCents?: number;
  netAmountCents?: number;
  currency?: string;
}

export interface CheckSubdomainRequest {
  slug: string;
  token: string;
}

/** available:false con reason NO es un error HTTP — viene 200 OK igual. */
export interface CheckSubdomainResponse {
  available: boolean;
  reason: string | null;
  expiresAtUtc: string | null;
}

export interface PreviewRegistrationResponse {
  firstName: string;
  lastName: string;
  maskedEmail: string;
  planName: string | null;
}

export interface CompleteRegistrationRequest {
  token: string;
  password: string;
  officeName: string;
  subdomain: string;
  termsAccepted: boolean;
  termsVersionId: string;
}

export interface CompleteRegistrationResponse {
  /** Literal "Provisioning" en éxito. */
  status: string;
  /** Path relativo: "/onboarding/status?token=...". */
  statusUrl: string;
}

export type OnboardingStatusValue =
  | 'PendingPayment'
  | 'PaymentProcessing'
  | 'PaymentCompleted'
  | 'RegistrationPending'
  | 'Provisioning'
  | 'ProvisioningFailed'
  | 'ManualReview'
  | 'Completed'
  | 'PaymentFailed'
  | 'Cancelled'
  | 'Expired'
  | 'Refunded';

export interface OnboardingStatusResponse {
  status: OnboardingStatusValue;
  currentStep: string | null;
  failureReason: string | null;
  failureCode: string | null;
  redirectUrl: string | null;
}

export interface TermsVersionResponse {
  termsVersionId: string;
  kind: string;
  version: string;
  contentUri: string | null;
  contentHash: string | null;
  locale: string;
  effectiveFromUtc: string;
  effectiveUntilUtc: string | null;
}

/** Body de error del backend: `Error(Code, Message)`. */
export interface ApiErrorBody {
  code: string;
  message: string;
}
