import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SITE_CONFIG } from '@core/config/site-config';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OnboardingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the post-OTP onboarding cookie when requesting payment options', () => {
    service.verifyEmailChallenge('challenge-1', { code: '123456' }).subscribe();

    const verifyRequest = http.expectOne(`${SITE_CONFIG.apiUrl}/onboarding/email-challenges/challenge-1/verify`);
    expect(verifyRequest.request.withCredentials).toBe(true);
    verifyRequest.flush({
      expiresAtUtc: '2026-09-04T12:00:00Z',
      tokenType: 'Bearer',
    });

    service.getPaymentOptions('plan-1', 'Monthly').subscribe((response) => {
      expect(response.options.length).toBe(1);
    });

    const optionsRequest = http.expectOne(`${SITE_CONFIG.apiUrl}/onboarding/payment-options?planId=plan-1&billingCycle=Monthly&currency=USD`);
    expect(optionsRequest.request.withCredentials).toBe(true);
    expect(optionsRequest.request.headers.has('X-Onboarding-Session')).toBe(false);
    optionsRequest.flush({
      options: [
        {
          provider: 'Stripe',
          method: 'Card',
          displayName: 'Card',
          enabled: true,
          priority: 10,
          disabledReason: null,
        },
      ],
    });
  });

  it('passes selected provider and method when starting checkout', () => {
    service.verifyEmailChallenge('challenge-1', { code: '123456' }).subscribe();
    http.expectOne(`${SITE_CONFIG.apiUrl}/onboarding/email-challenges/challenge-1/verify`).flush({
      expiresAtUtc: '2026-09-04T12:00:00Z',
      tokenType: 'Bearer',
    });

    service
      .startCheckout({
        onboardingId: 'onboarding-1',
        payerEmail: 'owner@example.com',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
        provider: 'PayPal',
        method: 'Wallet',
      })
      .subscribe();

    const checkoutRequest = http.expectOne(`${SITE_CONFIG.apiUrl}/onboarding/checkout`);
    expect(checkoutRequest.request.withCredentials).toBe(true);
    expect(checkoutRequest.request.headers.has('X-Onboarding-Session')).toBe(false);
    expect(checkoutRequest.request.body).toEqual({
      onboardingId: 'onboarding-1',
      payerEmail: 'owner@example.com',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      provider: 'PayPal',
      method: 'Wallet',
    });
    checkoutRequest.flush({
      paymentId: 'payment-1',
      checkoutUrl: 'https://paypal.example.com/checkout',
      expiresAtUtc: '2026-09-04T12:00:00Z',
      fullyCovered: false,
    });
  });

  it('uses the post-OTP onboarding cookie when reconciling payment after provider redirect', () => {
    service.verifyEmailChallenge('challenge-1', { code: '123456' }).subscribe();
    http.expectOne(`${SITE_CONFIG.apiUrl}/onboarding/email-challenges/challenge-1/verify`).flush({
      expiresAtUtc: '2026-09-04T12:00:00Z',
      tokenType: 'Bearer',
    });

    service.reconcilePayment().subscribe((response) => {
      expect(response.status).toBe('RegistrationPending');
      expect(response.registrationUrl).toBe('https://app.example.com/register?token=abc');
    });

    const reconcileRequest = http.expectOne(`${SITE_CONFIG.apiUrl}/onboarding/reconcile-payment`);
    expect(reconcileRequest.request.withCredentials).toBe(true);
    expect(reconcileRequest.request.headers.has('X-Onboarding-Session')).toBe(false);
    expect(reconcileRequest.request.body).toEqual({});
    reconcileRequest.flush({
      onboardingId: 'onboarding-1',
      paymentId: 'payment-1',
      status: 'RegistrationPending',
      registrationUrl: 'https://app.example.com/register?token=abc',
      failureCode: null,
      failureMessage: null,
    });
  });
});
