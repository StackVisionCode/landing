import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import {
  CheckSubdomainRequest,
  CheckSubdomainResponse,
  CompleteRegistrationRequest,
  CompleteRegistrationResponse,
  CreateEmailChallengeRequest,
  CreateEmailChallengeResponse,
  CreateOnboardingRequest,
  CreateOnboardingResponse,
  OnboardingPaymentOptionsResponse,
  PricingPreview,
  OnboardingStatusResponse,
  PreviewRegistrationResponse,
  ReconcileOnboardingPaymentResponse,
  ResumeCheckoutRequest,
  StartCheckoutRequest,
  StartCheckoutResponse,
  TermsVersionResponse,
  VerifyEmailChallengeRequest,
  VerifyEmailChallengeResponse,
} from './onboarding.models';

/**
 * Flujo "pago primero" (PayFlow) del Auth service — todas las rutas cuelgan
 * directo de la raíz del gateway, sin /api. Ver onboarding.models.ts para el
 * detalle de cada contrato (verificado contra el backend real).
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;
  private readonly credentialOptions = { withCredentials: true } as const;

  createEmailChallenge(request: CreateEmailChallengeRequest): Observable<CreateEmailChallengeResponse> {
    return this.http.post<CreateEmailChallengeResponse>(`${this.base}/onboarding/email-challenges`, request);
  }

  verifyEmailChallenge(
    challengeId: string,
    request: VerifyEmailChallengeRequest
  ): Observable<VerifyEmailChallengeResponse> {
    return this.http.post<VerifyEmailChallengeResponse>(
      `${this.base}/onboarding/email-challenges/${challengeId}/verify`,
      request,
      this.credentialOptions
    );
  }

  resendEmailChallenge(challengeId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/onboarding/email-challenges/${challengeId}/resend`, {});
  }

  createOnboarding(request: CreateOnboardingRequest): Observable<CreateOnboardingResponse> {
    return this.http.post<CreateOnboardingResponse>(
      `${this.base}/onboarding`,
      request,
      this.credentialOptions
    );
  }

  startCheckout(request: StartCheckoutRequest): Observable<StartCheckoutResponse> {
    return this.http.post<StartCheckoutResponse>(
      `${this.base}/onboarding/checkout`,
      request,
      this.credentialOptions
    );
  }

  /** Reanuda el pago del mismo onboarding desde el link del email (la referencia es la autorización;
   *  no requiere cookie de sesión — el link puede abrirse en otro navegador/dispositivo). */
  resumeCheckout(request: ResumeCheckoutRequest): Observable<StartCheckoutResponse> {
    return this.http.post<StartCheckoutResponse>(
      `${this.base}/onboarding/resume-checkout`,
      request,
      this.credentialOptions
    );
  }

  reconcilePayment(reference?: string): Observable<ReconcileOnboardingPaymentResponse> {
    // La referencia (del successUrl) es el fallback cuando falta la cookie (otro navegador/incógnito).
    // El backend prefiere la cookie; con la referencia devuelve solo estado, sin registrationUrl.
    return this.http.post<ReconcileOnboardingPaymentResponse>(
      `${this.base}/onboarding/reconcile-payment`,
      reference ? { reference } : {},
      this.credentialOptions
    );
  }

  /** OBF-2.5 — pedir reemisión del email "completa tu oficina" desde la pantalla fallback cuando el
   *  cliente no vio el link al pagar (vino desde otro dispositivo o lo borró). El reference autoriza. */
  resendRegistrationEmail(reference: string): Observable<void> {
    return this.http.post<void>(
      `${this.base}/onboarding/resume/${encodeURIComponent(reference)}/resend-registration-email`,
      {},
      this.credentialOptions
    );
  }

  cancelOnboarding(onboardingId: string, reason?: string): Observable<void> {
    return this.http.post<void>(
      `${this.base}/onboarding/${onboardingId}/cancel`,
      { reason },
      this.credentialOptions
    );
  }

  getPaymentOptions(
    planId: string,
    billingCycle: string,
    currency = 'USD'
  ): Observable<OnboardingPaymentOptionsResponse> {
    return this.http.get<OnboardingPaymentOptionsResponse>(`${this.base}/onboarding/payment-options`, {
      ...this.credentialOptions,
      params: { planId, billingCycle, currency },
    });
  }

  /** ¿El código de referido sirve hoy? Público y sin sesión; responde solo `{ isActive }` (un código reemplazado da false). */
  validateReferralCode(code: string): Observable<{ isActive: boolean }> {
    return this.http.get<{ isActive: boolean }>(
      `${this.base}/growth/public/referrals/codes/${encodeURIComponent(code)}/validate`
    );
  }

  /** Vista previa del precio con promo/gift antes de pagar (cotiza sin reservar). Exige la sesión post-OTP. */
  previewPricing(
    planId: string,
    billingCycle: string,
    promoCode?: string,
    giftCode?: string
  ): Observable<PricingPreview> {
    const params: Record<string, string> = { planId, billingCycle };
    if (promoCode) params['promoCode'] = promoCode;
    if (giftCode) params['giftCode'] = giftCode;
    return this.http.get<PricingPreview>(`${this.base}/onboarding/pricing-preview`, {
      ...this.credentialOptions,
      params,
    });
  }

  checkSubdomain(request: CheckSubdomainRequest): Observable<CheckSubdomainResponse> {
    return this.http.post<CheckSubdomainResponse>(`${this.base}/onboarding/subdomains/check`, request);
  }

  previewRegistration(token: string): Observable<PreviewRegistrationResponse> {
    return this.http.post<PreviewRegistrationResponse>(`${this.base}/onboarding/register/preview`, { token });
  }

  completeRegistration(request: CompleteRegistrationRequest): Observable<CompleteRegistrationResponse> {
    return this.http.post<CompleteRegistrationResponse>(`${this.base}/onboarding/register/complete`, request);
  }

  getStatus(token: string): Observable<OnboardingStatusResponse> {
    return this.http.get<OnboardingStatusResponse>(`${this.base}/onboarding/status`, { params: { token } });
  }

  /** Versión vigente de un documento legal. `kind` por defecto TermsOfService (el flujo de onboarding);
   *  las páginas legales del footer pasan también 'PrivacyPolicy'. */
  getCurrentTerms(locale: string, kind: 'TermsOfService' | 'PrivacyPolicy' = 'TermsOfService'): Observable<TermsVersionResponse> {
    return this.http.get<TermsVersionResponse>(`${this.base}/auth/onboarding/terms/current`, {
      params: { kind, locale },
    });
  }

  /** contentUri ya viene con el path completo (ej. /auth/onboarding/terms/{id}/content). */
  getTermsContent(contentUri: string): Observable<string> {
    return this.http.get(`${this.base}${contentUri}`, { responseType: 'text' });
  }

}
