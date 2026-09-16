import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import type { StartCheckoutRequest } from '@core/onboarding/onboarding.models';
import { RegisterPaymentReceivedComponent } from './register-payment-received.component';

function failedResponse(payerEmail: string | null) {
  return {
    onboardingId: 'onboarding-1',
    paymentId: 'payment-1',
    status: 'PaymentFailed' as const,
    registrationUrl: null,
    failureCode: 'card_declined',
    failureMessage: 'Your card was declined.',
    payerEmail,
  };
}

describe('RegisterPaymentReceivedComponent', () => {
  const originalLocation = window.location;

  function configure(reconcile: unknown) {
    const startCheckout = vi.fn((_request: StartCheckoutRequest) =>
      of({ paymentId: 'p2', checkoutUrl: 'https://stripe.test/session-2', expiresAtUtc: '', fullyCovered: false })
    );
    const onboarding = { reconcilePayment: vi.fn(() => of(reconcile)), startCheckout };
    TestBed.configureTestingModule({
      imports: [RegisterPaymentReceivedComponent],
      providers: [
        { provide: OnboardingService, useValue: onboarding },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });
    return { startCheckout };
  }

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', origin: 'http://localhost:4200' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    TestBed.resetTestingModule();
  });

  it('retries the payment on the same onboarding when the failed reconcile carries the email', () => {
    const { startCheckout } = configure(failedResponse('buyer@example.com'));
    const component = TestBed.createComponent(RegisterPaymentReceivedComponent).componentInstance as any;

    component.ngOnInit();
    expect(component.step()).toBe('failed');
    expect(component.canRetry()).toBe(true);

    component.retryPayment();

    expect(startCheckout).toHaveBeenCalledTimes(1);
    const request = startCheckout.mock.calls[0]?.[0];
    expect(request?.onboardingId).toBe('onboarding-1');
    expect(request?.payerEmail).toBe('buyer@example.com');
    expect(window.location.href).toBe('https://stripe.test/session-2');
  });

  it('offers only start-over when the failed reconcile has no email (reference path)', () => {
    configure(failedResponse(null));
    const component = TestBed.createComponent(RegisterPaymentReceivedComponent).componentInstance as any;

    component.ngOnInit();
    expect(component.step()).toBe('failed');
    expect(component.canRetry()).toBe(false);
  });
});
