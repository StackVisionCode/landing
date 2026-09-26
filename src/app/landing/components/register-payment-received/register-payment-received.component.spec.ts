import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
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

function rateLimited(retryAfterSeconds: number) {
  return new HttpErrorResponse({ status: 429, error: { code: 'RateLimit.Exceeded', retryAfterSeconds } });
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

  // La primera detección de cambios corre ngOnInit (el reconcile) una sola vez.
  function start() {
    const fixture = TestBed.createComponent(RegisterPaymentReceivedComponent);
    fixture.detectChanges();
    return fixture.componentInstance as any;
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
    const component = start();
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
    const component = start();
    expect(component.step()).toBe('failed');
    expect(component.canRetry()).toBe(false);
  });

  it('waits the throttle and checks again instead of giving up when reconcile is rate limited', () => {
    vi.useFakeTimers();
    try {
      const reconcilePayment = vi
        .fn()
        .mockReturnValueOnce(throwError(() => rateLimited(20)))
        .mockReturnValue(of(failedResponse('buyer@example.com')));
      TestBed.configureTestingModule({
        imports: [RegisterPaymentReceivedComponent],
        providers: [
          { provide: OnboardingService, useValue: { reconcilePayment, startCheckout: vi.fn() } },
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        ],
      });
      const component = start();
      expect(component.step()).toBe('processing');

      vi.advanceTimersByTime(19_000);
      expect(reconcilePayment).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      expect(reconcilePayment).toHaveBeenCalledTimes(2);
      expect(component.step()).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks the payment retry with a countdown when it is rate limited', () => {
    vi.useFakeTimers();
    try {
      const { startCheckout } = configure(failedResponse('buyer@example.com'));
      startCheckout.mockReturnValueOnce(throwError(() => rateLimited(5)));
      const component = start();

      component.retryPayment();
      expect(component.retryCooldown.active()).toBe(true);
      expect(component.retryError()).toBe('');
      expect(component.waitLabel()).toContain('0:05');

      component.retryPayment();
      expect(startCheckout).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5_000);
      component.retryPayment();
      expect(startCheckout).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
