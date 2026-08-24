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
  OnboardingStatusResponse,
  PreviewRegistrationResponse,
  StartCheckoutRequest,
  StartCheckoutResponse,
  TermsVersionResponse,
  VerifyEmailChallengeRequest,
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

  createEmailChallenge(request: CreateEmailChallengeRequest): Observable<CreateEmailChallengeResponse> {
    return this.http.post<CreateEmailChallengeResponse>(`${this.base}/onboarding/email-challenges`, request);
  }

  verifyEmailChallenge(challengeId: string, request: VerifyEmailChallengeRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/onboarding/email-challenges/${challengeId}/verify`, request);
  }

  resendEmailChallenge(challengeId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/onboarding/email-challenges/${challengeId}/resend`, {});
  }

  createOnboarding(request: CreateOnboardingRequest): Observable<CreateOnboardingResponse> {
    return this.http.post<CreateOnboardingResponse>(`${this.base}/onboarding`, request);
  }

  startCheckout(request: StartCheckoutRequest): Observable<StartCheckoutResponse> {
    return this.http.post<StartCheckoutResponse>(`${this.base}/onboarding/checkout`, request);
  }

  cancelOnboarding(onboardingId: string, reason?: string): Observable<void> {
    return this.http.post<void>(`${this.base}/onboarding/${onboardingId}/cancel`, { reason });
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

  /** kind fijo a TermsOfService — es lo único que usa este flujo. */
  getCurrentTerms(locale: string): Observable<TermsVersionResponse> {
    return this.http.get<TermsVersionResponse>(`${this.base}/auth/onboarding/terms/current`, {
      params: { kind: 'TermsOfService', locale },
    });
  }

  /** contentUri ya viene con el path completo (ej. /auth/onboarding/terms/{id}/content). */
  getTermsContent(contentUri: string): Observable<string> {
    return this.http.get(`${this.base}${contentUri}`, { responseType: 'text' });
  }
}
