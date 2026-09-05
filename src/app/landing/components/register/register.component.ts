import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import {
  visibleOnboardingPaymentOptions,
} from '@core/onboarding/onboarding-payment-options.util';
import { PlansService } from '@core/plans/plans.service';
import { moduleLabel } from '@core/plans/module-labels';
import { apiErrorCode } from '@core/onboarding/onboarding-error.util';
import type { PlanResponse } from '@core/plans/plans.models';
import type { BillingCycle, OnboardingPaymentOption } from '@core/onboarding/onboarding.models';

type RegisterStep =
  | 'loading'
  | 'invalid-plan'
  | 'load-error'
  | 'email'
  | 'otp'
  | 'details'
  | 'processing'
  | 'no-payment'
  | 'error';

const OTP_LENGTH = 6;
const OTP_DURATION_SECONDS = 600; // TTL real del challenge: 10 min (Onboarding_PayFirst_PasoAPaso.md §1.1)

/**
 * Página /register (PayFlow "pago primero"): selecciona plan por query param
 * (?plan=&cycle=), verifica el email por OTP, crea el TenantOnboarding y
 * arranca el checkout del provider elegido. El onboardingId solo vive en memoria de esta
 * sesión — nunca en localStorage/URL (invariante de seguridad del contrato).
 *
 * Orden de pasos verificado contra el código real (Onboarding_PayFirst_PasoAPaso.md
 * §1.1/§1.3): "verificar email" es un paso propio y AUTÓNOMO — POST
 * onboarding/email-challenges solo pide `email` (+firstNameHint opcional, ni
 * siquiera se usa acá). El resto de los datos de contacto (nombre/apellido/
 * teléfono) recién se piden DESPUÉS de verificar el OTP, porque
 * `POST onboarding` (CreateOnboardingCommand) exige el challenge YA
 * verificado — no tiene sentido pedirlos antes. Antes este componente pedía
 * todo junto en un solo paso antes del OTP; se separó en email → otp →
 * detalles para reflejar el orden real.
 */
@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register.component.html',
})
export class RegisterComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingService);
  private readonly plansService = inject(PlansService);
  protected readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;

  protected readonly step = signal<RegisterStep>('loading');
  protected readonly plan = signal<PlanResponse | null>(null);
  protected readonly cycle = signal<BillingCycle>('Monthly');
  protected readonly showCancelledNotice = signal(false);

  // Paso 1: solo el correo — es lo único que exige POST onboarding/email-challenges.
  protected readonly email = signal('');
  protected readonly isSendingCode = signal(false);
  protected readonly emailError = signal('');

  // Paso 2: OTP.
  protected readonly otp = signal('');
  private challengeId = '';
  protected readonly isVerifying = signal(false);
  protected readonly isResending = signal(false);
  protected readonly otpError = signal('');
  protected readonly otpSecondsLeft = signal(OTP_DURATION_SECONDS);
  private otpTimerId: ReturnType<typeof setInterval> | null = null;

  // Paso 3 (post-OTP): datos de contacto + códigos opcionales — recién acá
  // tiene sentido pedirlos, ya con el challenge verificado.
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly phone = signal('');
  protected readonly isSubmittingDetails = signal(false);
  protected readonly detailsError = signal('');
  protected readonly paymentOptions = signal<OnboardingPaymentOption[]>([]);
  protected readonly selectedPaymentOption = signal<OnboardingPaymentOption | null>(null);

  protected readonly showCodeFields = signal(false);
  protected readonly referralCode = signal('');
  protected readonly promoCode = signal('');
  protected readonly giftCode = signal('');

  // No-null cuando el checkout resultó fullyCovered — solo se usa para mostrar
  // el aviso de "tu código cubrió el costo completo" (netAmountCents es 0 por
  // definición en ese caso, no hace falta guardarlo aparte).
  protected readonly discountAmountCents = signal<number | null>(null);

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

    // El link real del correo de registro apunta a "{RegistrationUrlBase}/register?token=..."
    // (ResolveRegistrationTokenReferenceQuery.cs:41 en el backend — NO a /register/complete).
    // Sin este redirect, /register solo mira `plan` y cae directo al estado
    // "no encontramos ese plan" sin siquiera llamar a la API, aunque el token
    // y el plan resuelvan perfecto del lado del backend (bug real reportado:
    // el usuario ve "plan no encontrado" pese a que preview/plan responden 200).
    const token = params.get('token');
    if (token) {
      this.router.navigate(['/register/complete'], { queryParams: { token }, replaceUrl: true });
      return;
    }

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
        this.step.set('email');
      },
      error: () => this.step.set('load-error'),
    });
  }

  ngOnDestroy(): void {
    this.stopOtpTimer();
  }

  submitEmail(): void {
    if (this.isSendingCode()) return;
    this.emailError.set('');

    if (!this.email()) {
      this.emailError.set(this.t().authErrorRequiredFields);
      return;
    }
    if (!this.isValidEmail(this.email())) {
      this.emailError.set(this.t().authErrorInvalidEmail);
      return;
    }

    this.isSendingCode.set(true);
    this.onboarding.createEmailChallenge({ email: this.email() }).subscribe({
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
        this.emailError.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
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
      next: () => this.loadPaymentOptionsAfterOtp(),
      error: (err) => {
        this.isVerifying.set(false);
        this.otpError.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
      },
    });
  }

  /** Volver del paso OTP al de correo — por si se equivocó al escribirlo.
   *  El challenge en curso se deja morir solo (nunca se cancela server-side). */
  backToEmail(): void {
    this.stopOtpTimer();
    this.step.set('email');
    this.otpError.set('');
  }

  /** Volver de la pantalla de error al paso de detalles, para reintentar sin
   *  perder el email ya verificado (no tiene sentido pedir un OTP nuevo). */
  backToDetails(): void {
    this.errorMessage.set('');
    this.step.set('details');
  }

  submitDetails(): void {
    if (this.isSubmittingDetails()) return;
    this.detailsError.set('');

    if (!this.firstName() || !this.lastName()) {
      this.detailsError.set(this.t().authErrorRequiredFields);
      return;
    }

    const plan = this.plan();
    if (!plan) {
      this.step.set('invalid-plan');
      return;
    }
    if (!this.selectedPaymentOption()) {
      this.detailsError.set(this.t().regPaymentMethodUnavailable);
      return;
    }

    this.isSubmittingDetails.set(true);
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
        error: (err) => {
          this.isSubmittingDetails.set(false);
          this.detailsError.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
        },
      });
  }

  private startCheckout(onboardingId: string): void {
    this.isSubmittingDetails.set(false);
    this.step.set('processing');
    this.processingMessage.set(this.t().regPreparingPayment);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://taxproffice.com';
    const plan = this.plan();
    const paymentOption = this.selectedPaymentOption();

    this.onboarding
      .startCheckout({
        onboardingId,
        payerEmail: this.email(),
        successUrl: `${origin}/register/payment-received`,
        cancelUrl: `${origin}/register?plan=${plan?.id ?? ''}&cycle=${this.cycle()}&cancelled=1`,
        provider: paymentOption?.provider,
        method: paymentOption?.method,
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

  private loadPaymentOptionsAfterOtp(): void {
    const plan = this.plan();
    if (!plan) {
      this.isVerifying.set(false);
      this.step.set('invalid-plan');
      return;
    }

    this.onboarding.getPaymentOptions(plan.id, this.cycle()).subscribe({
      next: (response) => {
        this.isVerifying.set(false);
        this.stopOtpTimer();
        const visibleOptions = visibleOnboardingPaymentOptions(response.options);
        this.paymentOptions.set(visibleOptions);
        this.selectedPaymentOption.set(visibleOptions[0] ?? null);
        if (!this.selectedPaymentOption()) {
          this.otpError.set(this.t().regPaymentMethodUnavailable);
          return;
        }
        this.step.set('details');
      },
      error: (err) => {
        this.isVerifying.set(false);
        this.otpError.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
      },
    });
  }

  protected selectPaymentOption(option: OnboardingPaymentOption): void {
    if (this.isSubmittingDetails()) return;
    this.selectedPaymentOption.set(option);
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
      case 'PaymentMethod.Disabled':
        return t.regPaymentMethodUnavailable;
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
