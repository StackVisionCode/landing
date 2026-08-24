import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { PlansService } from '@core/plans/plans.service';
import { moduleLabel } from '@core/plans/module-labels';
import { apiErrorCode } from '@core/onboarding/onboarding-error.util';
import type { PlanResponse } from '@core/plans/plans.models';
import type { BillingCycle } from '@core/onboarding/onboarding.models';

type RegisterStep = 'loading' | 'invalid-plan' | 'load-error' | 'contact' | 'otp' | 'processing' | 'no-payment' | 'error';

const OTP_LENGTH = 6;
const OTP_DURATION_SECONDS = 600; // TTL real del challenge: 10 min (API_Contract.md §2.2)

/**
 * Página /register (PayFlow "pago primero"): selecciona plan por query param
 * (?plan=&cycle=), verifica el email por OTP, crea el TenantOnboarding y
 * arranca el checkout de Stripe. El onboardingId solo vive en memoria de esta
 * sesión — nunca en localStorage/URL (invariante §5 de API_Contract.md).
 */
@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register.component.html',
})
export class RegisterComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly onboarding = inject(OnboardingService);
  private readonly plansService = inject(PlansService);
  protected readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;

  protected readonly step = signal<RegisterStep>('loading');
  protected readonly plan = signal<PlanResponse | null>(null);
  protected readonly cycle = signal<BillingCycle>('Monthly');
  protected readonly showCancelledNotice = signal(false);

  protected readonly email = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly phone = signal('');
  protected readonly isSendingCode = signal(false);
  protected readonly contactError = signal('');

  // Códigos opcionales de Gift/Referral (StartOnboardingCheckoutCommand) — se
  // guardan acá porque se piden en el mismo paso que el resto de los datos de
  // contacto, pero solo se usan más tarde en startCheckout(), tras el OTP.
  protected readonly showCodeFields = signal(false);
  protected readonly referralCode = signal('');
  protected readonly promoCode = signal('');
  protected readonly giftCode = signal('');

  // No-null cuando el checkout resultó fullyCovered — solo se usa para mostrar
  // el aviso de "tu código cubrió el costo completo" (netAmountCents es 0 por
  // definición en ese caso, no hace falta guardarlo aparte).
  protected readonly discountAmountCents = signal<number | null>(null);

  protected readonly otp = signal('');
  private challengeId = '';
  protected readonly isVerifying = signal(false);
  protected readonly isResending = signal(false);
  protected readonly otpError = signal('');
  protected readonly otpSecondsLeft = signal(OTP_DURATION_SECONDS);
  private otpTimerId: ReturnType<typeof setInterval> | null = null;

  protected readonly processingMessage = signal('');
  protected readonly errorMessage = signal('');

  get otpTimerDisplay(): string {
    const seconds = this.otpSecondsLeft();
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  get planPrice(): number {
    const plan = this.plan();
    if (!plan) return 0;
    return plan.pricesUsdByCycle[this.cycle()] ?? plan.monthlyPriceUsd;
  }

  /** Top 4 módulos del plan, para el panel lateral — contenido real (no
   *  copy inventado), mismo diccionario que usa Pricing para la lista completa. */
  get planHighlights(): string[] {
    const plan = this.plan();
    if (!plan) return [];
    return plan.enabledModules.slice(0, 4).map((key) => moduleLabel(key, this.translation.lang()));
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.cycle.set(params.get('cycle') === 'Yearly' ? 'Yearly' : 'Monthly');
    this.showCancelledNotice.set(params.get('cancelled') === '1');
    this.loadPlan();
  }

  retryLoadPlan(): void {
    this.loadPlan();
  }

  /** Separado de "plan inexistente": un fallo de red/API acá es transitorio y
   *  recuperable con reintento, no lo mismo que un plan que nunca existió. */
  private loadPlan(): void {
    const planId = this.route.snapshot.queryParamMap.get('plan');
    if (!planId) {
      this.step.set('invalid-plan');
      return;
    }

    this.step.set('loading');
    this.plansService.getPlans().subscribe({
      next: (plans) => {
        const found = plans.find((p) => p.id === planId);
        if (!found) {
          this.step.set('invalid-plan');
          return;
        }
        this.plan.set(found);
        this.step.set('contact');
      },
      error: () => this.step.set('load-error'),
    });
  }

  ngOnDestroy(): void {
    this.stopOtpTimer();
  }

  submitContact(): void {
    if (this.isSendingCode()) return;
    this.contactError.set('');

    if (!this.email() || !this.firstName() || !this.lastName()) {
      this.contactError.set(this.t().authErrorRequiredFields);
      return;
    }
    if (!this.isValidEmail(this.email())) {
      this.contactError.set(this.t().authErrorInvalidEmail);
      return;
    }

    this.isSendingCode.set(true);
    this.onboarding.createEmailChallenge({ email: this.email(), firstNameHint: this.firstName() }).subscribe({
      next: (res) => {
        this.isSendingCode.set(false);
        this.challengeId = res.challengeId;
        this.otp.set('');
        this.otpError.set('');
        this.step.set('otp');
        this.startOtpTimer();
      },
      error: (err) => {
        this.isSendingCode.set(false);
        this.contactError.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
      },
    });
  }

  onOtpInput(value: string): void {
    this.otp.set(value.replace(/\D/g, '').slice(0, OTP_LENGTH));
  }

  resendOtp(): void {
    if (this.isResending()) return;
    this.isResending.set(true);
    this.otpError.set('');
    this.onboarding.resendEmailChallenge(this.challengeId).subscribe({
      next: () => {
        this.isResending.set(false);
        this.otp.set('');
        this.startOtpTimer();
      },
      error: (err) => {
        this.isResending.set(false);
        this.otpError.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
      },
    });
  }

  verifyOtp(): void {
    if (this.isVerifying()) return;
    this.otpError.set('');

    if (this.otp().length !== OTP_LENGTH) {
      this.otpError.set(this.t().regOtpErrorLength);
      return;
    }

    this.isVerifying.set(true);
    this.onboarding.verifyEmailChallenge(this.challengeId, { code: this.otp() }).subscribe({
      next: () => this.createOnboardingAndCheckout(),
      error: (err) => {
        this.isVerifying.set(false);
        this.otpError.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
      },
    });
  }

  backToContact(): void {
    this.step.set('contact');
    this.errorMessage.set('');
  }

  private createOnboardingAndCheckout(): void {
    const plan = this.plan();
    if (!plan) {
      this.step.set('invalid-plan');
      return;
    }

    this.stopOtpTimer();
    this.step.set('processing');
    this.processingMessage.set(this.t().regCreatingAccount);

    this.onboarding
      .createOnboarding({
        email: this.email(),
        firstName: this.firstName(),
        lastName: this.lastName(),
        phone: this.phone() || undefined,
        planId: plan.id,
        emailVerificationChallengeId: this.challengeId,
        billingCycle: this.cycle(),
      })
      .subscribe({
        next: (created) => this.startCheckout(created.onboardingId),
        error: (err) => this.showError(err),
      });
  }

  private startCheckout(onboardingId: string): void {
    this.processingMessage.set(this.t().regPreparingPayment);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://taxproffice.com';
    const plan = this.plan();

    this.onboarding
      .startCheckout({
        onboardingId,
        payerEmail: this.email(),
        successUrl: `${origin}/register/payment-received`,
        cancelUrl: `${origin}/register?plan=${plan?.id ?? ''}&cycle=${this.cycle()}&cancelled=1`,
        referralCode: this.referralCode().trim() || undefined,
        promoCode: this.promoCode().trim() || undefined,
        giftCode: this.giftCode().trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          if (res.fullyCovered) {
            this.discountAmountCents.set(res.discountAmountCents ?? null);
            this.step.set('no-payment');
            return;
          }
          this.processingMessage.set(this.t().regRedirectingPayment);
          if (typeof window !== 'undefined') {
            window.location.href = res.checkoutUrl;
          }
        },
        error: (err) => this.showError(err),
      });
  }

  private showError(err: unknown): void {
    this.errorMessage.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
    this.step.set('error');
  }

  private mapError(code: string | null): string | null {
    const t = this.t();
    switch (code) {
      case 'Onboarding.OtpMismatch':
        return t.regOtpMismatch;
      case 'Onboarding.OtpLocked':
        return t.regOtpLocked;
      case 'Onboarding.OtpExpired':
        return t.regOtpExpired;
      case 'Onboarding.OtpRateLimited':
        return t.regOtpRateLimited;
      case 'Onboarding.ResendCooldown':
        return t.regResendCooldown;
      case 'Onboarding.ResendLimitExceeded':
        return t.regResendLimitExceeded;
      default:
        return null;
    }
  }

  private startOtpTimer(): void {
    this.stopOtpTimer();
    this.otpSecondsLeft.set(OTP_DURATION_SECONDS);
    this.otpTimerId = setInterval(() => {
      const next = this.otpSecondsLeft() - 1;
      this.otpSecondsLeft.set(Math.max(next, 0));
      if (next <= 0) this.stopOtpTimer();
    }, 1000);
  }

  private stopOtpTimer(): void {
    if (this.otpTimerId !== null) {
      clearInterval(this.otpTimerId);
      this.otpTimerId = null;
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
