import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { PlansService } from '@core/plans/plans.service';
import type { PlanResponse } from '@core/plans/plans.models';
import type { StartCheckoutRequest } from '@core/onboarding/onboarding.models';
import { RegisterComponent } from './register.component';

const PLAN: PlanResponse = {
  id: 'plan-1',
  code: 'PRO',
  name: 'Pro',
  description: '',
  tier: 'Pro',
  monthlyPriceUsd: 99,
  supportedBillingCycles: ['Monthly'],
  pricesUsdByCycle: { Monthly: 99 },
  maxUsers: 5,
  maxPendingInvitations: 5,
  storageQuotaBytes: 0,
  enabledModules: [],
};

const CARD = { provider: 'Stripe', method: 'Card', displayName: 'Card', enabled: true, priority: 1, disabledReason: null };

function rateLimited(retryAfterSeconds: number, code = 'RateLimit.Exceeded') {
  return new HttpErrorResponse({ status: 429, error: { code, retryAfterSeconds } });
}

describe('RegisterComponent', () => {
  const originalLocation = window.location;

  function create(params: Record<string, string>, onboarding: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: OnboardingService, useValue: onboarding },
        { provide: PlansService, useValue: { getPlans: () => of([PLAN]) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => params[key] ?? null } } } },
      ],
    });
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    return fixture.componentInstance as any;
  }

  /** Lleva el registro hasta el paso de datos con el email ya verificado. */
  function reachDetails(component: any): void {
    component.email.set('owner@example.com');
    component.submitEmail();
    component.onOtpInput('123456');
    component.verifyOtp();
    component.firstName.set('Ada');
    component.lastName.set('Lovelace');
  }

  function onboardingMock(overrides: Record<string, unknown> = {}) {
    return {
      createEmailChallenge: vi.fn(() => of({ challengeId: 'challenge-1' })),
      resendEmailChallenge: vi.fn(() => of({})),
      verifyEmailChallenge: vi.fn(() => of({})),
      getPaymentOptions: vi.fn(() => of({ options: [CARD] })),
      createOnboarding: vi.fn(() => of({ onboardingId: 'onboarding-1' })),
      startCheckout: vi.fn((_request: StartCheckoutRequest) =>
        of({ checkoutUrl: 'https://stripe.test/session', fullyCovered: false }),
      ),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', origin: 'http://localhost:4200' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    TestBed.resetTestingModule();
  });

  it('prefills the referral code from the referral link', () => {
    const component = create({ plan: 'plan-1', referral: ' FRIEND10 ' });

    expect(component.referralCode()).toBe('FRIEND10');
    expect(component.showCodeFields()).toBe(true);
    expect(component.step()).toBe('email');
  });

  it('keeps the referral in the cancel url of the checkout', () => {
    const onboarding = onboardingMock();
    const component = create({ plan: 'plan-1', referral: 'FRIEND10' }, onboarding);
    reachDetails(component);

    component.submitDetails();

    const request = onboarding.startCheckout.mock.calls[0]?.[0];
    expect(request?.referralCode).toBe('FRIEND10');
    expect(request?.cancelUrl).toBe('http://localhost:4200/register?plan=plan-1&cycle=Monthly&cancelled=1&referral=FRIEND10');
  });

  it('blocks sending the code while the backend asks to wait, without showing an error', () => {
    const onboarding = onboardingMock({
      createEmailChallenge: vi
        .fn()
        .mockReturnValueOnce(throwError(() => rateLimited(30)))
        .mockReturnValue(of({ challengeId: 'challenge-1' })),
    });
    const component = create({ plan: 'plan-1' }, onboarding);
    component.email.set('owner@example.com');

    component.submitEmail();
    expect(component.sendCodeCooldown.active()).toBe(true);
    expect(component.emailError()).toBe('');
    expect(component.throttleNotice('send', component.sendCodeCooldown)).toBeTruthy();
    expect(component.waitLabel(component.sendCodeCooldown)).toContain('0:30');

    component.submitEmail();
    expect(onboarding.createEmailChallenge).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    component.submitEmail();
    expect(onboarding.createEmailChallenge).toHaveBeenCalledTimes(2);
    expect(component.step()).toBe('otp');
  });

  it('starts the resend cooldown as soon as the code is sent', () => {
    const onboarding = onboardingMock();
    const component = create({ plan: 'plan-1' }, onboarding);
    component.email.set('owner@example.com');

    component.submitEmail();
    component.resendOtp();
    expect(onboarding.resendEmailChallenge).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    component.resendOtp();
    expect(onboarding.resendEmailChallenge).toHaveBeenCalledTimes(1);
    expect(component.resendCooldown.active()).toBe(true);
  });

  it('uses the wait of a domain throttle on resend', () => {
    const onboarding = onboardingMock({
      resendEmailChallenge: vi.fn(() => throwError(() => rateLimited(45, 'Onboarding.ResendCooldown'))),
    });
    const component = create({ plan: 'plan-1' }, onboarding);
    component.email.set('owner@example.com');
    component.submitEmail();
    vi.advanceTimersByTime(60_000);

    component.resendOtp();

    expect(component.resendCooldown.secondsLeft()).toBe(45);
    expect(component.otpError()).toBe('');
  });

  it('reuses the created onboarding when the checkout is retried after a throttle', () => {
    const onboarding = onboardingMock({
      startCheckout: vi
        .fn()
        .mockReturnValueOnce(throwError(() => rateLimited(20)))
        .mockReturnValue(of({ checkoutUrl: 'https://stripe.test/session', fullyCovered: false })),
    });
    const component = create({ plan: 'plan-1' }, onboarding);
    reachDetails(component);

    component.submitDetails();
    expect(component.step()).toBe('details');
    expect(component.submitCooldown.active()).toBe(true);
    expect(component.detailsError()).toBe('');

    vi.advanceTimersByTime(20_000);
    component.submitDetails();

    expect(onboarding.createOnboarding).toHaveBeenCalledTimes(1);
    expect(onboarding.startCheckout).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe('https://stripe.test/session');
  });

  it('shows the mapped message for errors that are not a wait', () => {
    const onboarding = onboardingMock({
      verifyEmailChallenge: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'Onboarding.OtpMismatch' } })),
      ),
    });
    const component = create({ plan: 'plan-1' }, onboarding);
    component.email.set('owner@example.com');
    component.submitEmail();
    component.onOtpInput('000000');

    component.verifyOtp();

    expect(component.verifyCooldown.active()).toBe(false);
    expect(component.otpError()).toBe(component.t().regOtpMismatch);
  });
});
