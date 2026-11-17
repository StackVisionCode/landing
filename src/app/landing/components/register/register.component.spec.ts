import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { PlansService } from '@core/plans/plans.service';
import type { PlanResponse } from '@core/plans/plans.models';
import type { StartCheckoutRequest } from '@core/onboarding/onboarding.models';
import { captureReferralLink, readReferralLink } from '@core/referrals/referral-link';
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
  rank: 2,
  isFeatured: false,
};

const CARD = { provider: 'Stripe', method: 'Card', displayName: 'Card', enabled: true, priority: 1, disabledReason: null };

function rateLimited(retryAfterSeconds: number, code = 'RateLimit.Exceeded') {
  return new HttpErrorResponse({ status: 429, error: { code, retryAfterSeconds } });
}

describe('RegisterComponent', () => {
  const originalLocation = window.location;

  function create(params: Record<string, string>, onboarding: Record<string, unknown> = {}, plans: PlanResponse[] = [PLAN]) {
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([{ path: 'register', children: [] }]),
        { provide: OnboardingService, useValue: onboarding },
        { provide: PlansService, useValue: { getPlans: () => of(plans) } },
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
    component.billingPreferenceMode.set('Manual');
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
      cancelOnboarding: vi.fn(() => of(void 0)),
      validateReferralCode: vi.fn(() => of({ isActive: true })),
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
    window.sessionStorage.clear();
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    TestBed.resetTestingModule();
  });

  it('opens with the only plan sold when the referral link brings no plan', () => {
    const component = create({ referral: 'TVR-EHNF0XF59R', ch: 'copy', sid: '29df4c9e-a17c-4a91-9af8-08c9dec6d5b8' });

    expect(component.step()).toBe('email');
    expect(component.plan()?.id).toBe('plan-1');
    expect(component.referralCode()).toBe('TVR-EHNF0XF59R');
  });

  it('asks to choose a plan when several are sold and the link brings none', () => {
    const other: PlanResponse = { ...PLAN, id: 'plan-2', name: 'Team', rank: 3 };
    const component = create({ referral: 'TVR-EHNF0XF59R' }, {}, [PLAN, other]);

    expect(component.step()).toBe('choose-plan');
    component.choosePlan(other);

    expect(component.plan()?.id).toBe('plan-2');
    expect(component.step()).toBe('email');
  });

  it('falls back to the catalog when the plan in the url was edited', () => {
    const component = create({ plan: 'not-a-real-plan' });

    expect(component.step()).toBe('email');
    expect(component.plan()?.id).toBe('plan-1');
  });

  it('uses a cycle the plan sells when the url asks for one it does not', () => {
    const component = create({ plan: 'plan-1', cycle: 'Yearly' });

    expect(component.cycle()).toBe('Monthly');
  });

  it('ignores a referral code edited into an impossible shape', () => {
    const component = create({ plan: 'plan-1', referral: '<script>alert(1)</script>' });

    expect(component.referralCode()).toBe('');
  });

  it('forgets the saved referral link once its signup reaches the checkout', () => {
    captureReferralLink('?referral=TVR-EHNF0XF59R&ch=copy', window.sessionStorage);
    const onboarding = onboardingMock();
    const component = create({ plan: 'plan-1' }, onboarding);
    expect(component.referralCode()).toBe('TVR-EHNF0XF59R');
    reachDetails(component);

    component.submitDetails();

    // La siguiente alta en la misma pestaña ya no hereda el código.
    expect(onboarding.startCheckout).toHaveBeenCalled();
    expect(readReferralLink(window.sessionStorage)).toBeNull();
  });

  it('explains a code that cannot be used with the buyer email', () => {
    const component = create({ plan: 'plan-1' });
    const t = component.t();
    const line = (errorCode: string) => ({ kind: 'Promo', codeHint: 'WELC…', valid: false, discountAmountCents: 0, errorCode });

    expect(component.codeLineMessage(line('Onboarding.CodeNotAllowedForEmail'))).toBe(t.regCodeNotAllowedForEmail);
    expect(component.codeLineMessage(line('Onboarding.CodeAlreadyUsedByBuyer'))).toBe(t.regCodeAlreadyUsed);
    expect(component.codeLineMessage(line('Codes.CreateQuote.CodeNotFound'))).toBe(t.regCodeInvalid);
  });

  it('explains a code that cannot be combined with the other one', () => {
    const component = create({ plan: 'plan-1' });
    const line = { kind: 'Gift', codeHint: 'GIFT…', valid: false, discountAmountCents: 0, errorCode: 'Onboarding.CodeNotStackable' };

    expect(component.codeLineMessage(line)).toBe(component.t().regCodeNotStackable);
  });

  it('goes back to the details when a code cannot be combined at checkout', () => {
    const onboarding = onboardingMock({
      startCheckout: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'Onboarding.CodeNotStackable' } })),
      ),
    });
    const component = create({ plan: 'plan-1' }, onboarding);
    reachDetails(component);

    component.submitDetails();

    expect(component.detailsError()).toBe(component.t().regCodeNotStackable);
  });

  it('says what a valid code does, by how long it lasts', () => {
    const component = create({ plan: 'plan-1' });
    const valid = (extra: object) => ({ kind: 'Promo', codeHint: 'SPRI…', valid: true, discountAmountCents: 2580, errorCode: null, ...extra });

    expect(component.codeLineBenefit(valid({ percentageBasisPoints: 3000, duration: 'Once' }), 'USD')).toBe('30% off your first payment');
    expect(component.codeLineBenefit(valid({ percentageBasisPoints: 2000, duration: 'Months', durationMonths: 3 }), 'USD')).toBe('20% off for 3 months');
    expect(component.codeLineBenefit(valid({ percentageBasisPoints: 2000, duration: 'Months', durationMonths: 1 }), 'USD')).toBe('20% off for 1 month');
    expect(component.codeLineBenefit(valid({ percentageBasisPoints: 1000, duration: 'Forever' }), 'USD')).toBe('10% off, forever');
    expect(component.codeLineBenefit(valid({ fixedAmountCents: 500, duration: 'Once' }), 'USD')).toBe('$5.00 off your first payment');
    // Un backend sin duración, o una línea inválida, no agrega texto.
    expect(component.codeLineBenefit(valid({}), 'USD')).toBe('');
    expect(component.codeLineBenefit({ ...valid({ percentageBasisPoints: 1000, duration: 'Forever' }), valid: false }, 'USD')).toBe('');
  });

  it('explains at checkout that the same person already used the code', () => {
    const onboarding = onboardingMock({
      startCheckout: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'Onboarding.CodeAlreadyUsedByBuyer' } })),
      ),
    });
    const component = create({ plan: 'plan-1' }, onboarding);
    reachDetails(component);

    component.submitDetails();

    expect(component.detailsError()).toBe(component.t().regCodeAlreadyUsed);
  });

  it('blocks Continue while the referral code is not active', () => {
    const onboarding = onboardingMock({ validateReferralCode: vi.fn(() => of({ isActive: false })) });
    const component = create({ plan: 'plan-1' }, onboarding);
    reachDetails(component);
    // Un cupón escrito en el campo de referido.
    component.referralCode.set('ONCEPERBUYER');

    component.submitDetails();

    expect(onboarding.validateReferralCode).toHaveBeenCalledWith('ONCEPERBUYER');
    expect(onboarding.createOnboarding).not.toHaveBeenCalled();
    expect(onboarding.startCheckout).not.toHaveBeenCalled();
    expect(component.detailsError()).toBe(component.t().regReferralCodeInactive);
  });

  it('continues once the inactive referral code is removed', () => {
    const onboarding = onboardingMock({ validateReferralCode: vi.fn(() => of({ isActive: false })) });
    const component = create({ plan: 'plan-1' }, onboarding);
    reachDetails(component);
    component.referralCode.set('ONCEPERBUYER');
    component.submitDetails();

    component.referralCode.set('');
    component.submitDetails();

    expect(onboarding.startCheckout).toHaveBeenCalledTimes(1);
    expect(onboarding.startCheckout.mock.calls[0]?.[0]?.referralCode).toBeUndefined();
  });

  it('does not block the signup when the referral check itself fails', () => {
    const onboarding = onboardingMock({
      validateReferralCode: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 503 }))),
    });
    const component = create({ plan: 'plan-1' }, onboarding);
    reachDetails(component);
    component.referralCode.set('FRIEND10');

    component.submitDetails();

    expect(onboarding.startCheckout).toHaveBeenCalledTimes(1);
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

  it('sends the referral channel and share id from the link, only for attribution', () => {
    const shareId = '3f1c8a52-7d4e-4b1a-9c0e-5a6b7c8d9e0f';
    const onboarding = onboardingMock();
    const component = create({ plan: 'plan-1', referral: 'FRIEND10', ch: 'WhatsApp', sid: shareId }, onboarding);
    reachDetails(component);

    component.submitDetails();

    const request = onboarding.startCheckout.mock.calls[0]?.[0];
    expect(request?.referralChannel).toBe('whatsapp');
    expect(request?.referralShareId).toBe(shareId);
    expect(request?.cancelUrl).toContain(`&ch=whatsapp&sid=${shareId}`);
  });

  it('ignores a malformed share id or channel instead of sending them', () => {
    const onboarding = onboardingMock();
    const component = create({ plan: 'plan-1', referral: 'FRIEND10', ch: 'x'.repeat(40), sid: 'not-a-guid' }, onboarding);
    reachDetails(component);

    component.submitDetails();

    const request = onboarding.startCheckout.mock.calls[0]?.[0];
    expect(request?.referralChannel).toBeUndefined();
    expect(request?.referralShareId).toBeUndefined();
  });

  it('prefills the gift code from a gift card link', () => {
    const component = create({ plan: 'plan-1', gift: ' gift-7k3q9m2x ' });

    expect(component.giftCode()).toBe('GIFT-7K3Q9M2X');
    expect(component.showCodeFields()).toBe(true);
  });

  it('shows the gross, discount and net quoted for the typed gift code', () => {
    const preview = {
      grossAmountCents: 12900,
      discountAmountCents: 2500,
      netAmountCents: 10400,
      currency: 'USD',
      fullyCovered: false,
      lines: [{ kind: 'Gift', codeHint: 'GIFT…', valid: true, discountAmountCents: 2500, errorCode: null }],
    };
    const previewPricing = vi.fn().mockReturnValue(of(preview));
    const component = create({ plan: 'plan-1', gift: 'GIFT25ABC' }, onboardingMock({ previewPricing }));

    (component as unknown as { previewCodes(): void }).previewCodes();

    expect(previewPricing).toHaveBeenCalledWith('plan-1', 'Monthly', undefined, 'GIFT25ABC');
    expect((component as unknown as { pricingPreview(): unknown }).pricingPreview()).toEqual(preview);
  });

  it('does not ask for a quote when there are no codes', () => {
    const previewPricing = vi.fn();
    const component = create({ plan: 'plan-1' }, onboardingMock({ previewPricing }));

    (component as unknown as { previewCodes(): void }).previewCodes();

    expect(previewPricing).not.toHaveBeenCalled();
  });

  it('ignores a malformed gift code in the link', () => {
    const component = create({ plan: 'plan-1', gift: '<script>' });

    expect(component.giftCode()).toBe('');
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

  it('offers a cancel button in the processing step and routes back to /register with the cancelled notice', () => {
    const onboarding = onboardingMock();
    const component = create({ plan: 'plan-1' }, onboarding);
    reachDetails(component);
    component.submitDetails();
    expect(component.step()).toBe('processing');
    expect(component.canCancelProcessing()).toBe(true);

    component.cancelOnboarding();

    expect(onboarding.cancelOnboarding).toHaveBeenCalledWith('onboarding-1');
  });

  it('hides the cancel button in processing when there is no onboardingId in memory', () => {
    const onboarding = onboardingMock();
    const component = create({ plan: 'plan-1' }, onboarding);
    component.step.set('processing');
    expect(component.canCancelProcessing()).toBe(false);
  });

  it('resets processing back to the email step on a bfcache restore without onboardingId', () => {
    const component = create({ plan: 'plan-1' });
    component.step.set('processing');
    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });

    window.dispatchEvent(event);

    expect(component.step()).toBe('email');
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
