import { InfinityLoaderComponent } from '@shared/infinity-loader/infinity-loader.component';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { RegisterShellComponent } from '../register-shell/register-shell.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SITE_CONFIG, PLATFORM_BRAND, PLATFORM_LEGAL_NAME } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import {
  visibleOnboardingPaymentOptions,
} from '@core/onboarding/onboarding-payment-options.util';
import { PlansService } from '@core/plans/plans.service';
import { clearReferralLink, parseReferralLink, readReferralLink } from '@core/referrals/referral-link';
import { sessionStore } from '@core/public-booking/attribution';
import { moduleLabel } from '@core/plans/module-labels';
import { apiErrorCode } from '@core/http/api-error';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock, readThrottle, type ThrottleKind } from '@core/http/throttling';
import type { PlanResponse } from '@core/plans/plans.models';
import { annualSavings } from '@core/plans/plan-pricing';
import type {
  BillingCycle,
  OnboardingPaymentOption,
  PricingPreview,
  PricingPreviewLine,
} from '@core/onboarding/onboarding.models';
import {
  BILLING_PREFERENCE_CONSENT_VERSION,
  type BillingPreferenceMode,
} from '@core/account/billing-preference.service';

/** Clave en sessionStorage: la preferencia + consent exacto que el usuario vio al firmar en /register.
 *  Se conserva durante el redirect al provider y hasta /register/complete, donde recién hay sesión
 *  autenticada para persistirla en el backend contra el tenant recién provisionado. */
export const BILLING_PREF_CONSENT_STORAGE_KEY = 'tv.onboarding.billingPreferenceConsent';

export interface PendingBillingPreferenceConsent {
  mode: BillingPreferenceMode;
  providerCode: string;
  consentText: string;
  consentTextVersion: string;
  capturedAtUtc: string;
}


type RegisterStep =
  | 'loading'
  | 'choose-plan'
  | 'invalid-plan'
  | 'load-error'
  | 'email'
  | 'otp'
  | 'details'
  | 'processing'
  | 'no-payment'
  | 'error';

type ThrottledAction = 'send' | 'resend' | 'verify' | 'submit';

/** Códigos de Auth para un cupón que esta persona no puede usar (correo desechable o ya usado por ella). */
const CODE_REFUSED_FOR_BUYER = new Set([
  'Onboarding.CodeNotAllowedForEmail',
  'Onboarding.CodeAlreadyUsedByBuyer',
  'Onboarding.CodeNotStackable',
]);

const OTP_LENGTH = 6;
const OTP_DURATION_SECONDS = 600; // TTL real del challenge: 10 min (Onboarding_PayFirst_PasoAPaso.md §1.1)
const RESEND_COOLDOWN_SECONDS = 60; // cooldown real del reenvío en Auth

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
  imports: [FormsModule, NgTemplateOutlet, RouterLink, RegisterShellComponent, InfinityLoaderComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register.component.html',
})
export class RegisterComponent implements OnInit, OnDestroy {
  /** Marca y razón social de la plataforma (site-config), nunca escritas en el template. */
  protected readonly brand = PLATFORM_BRAND;
  protected readonly legalName = PLATFORM_LEGAL_NAME;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingService);
  private readonly plansService = inject(PlansService);
  protected readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;

  protected readonly step = signal<RegisterStep>('loading');
  protected readonly plan = signal<PlanResponse | null>(null);
  /** Planes a elegir cuando el link no trae uno válido y se vende más de uno. */
  protected readonly planChoices = signal<readonly PlanResponse[]>([]);
  protected readonly cycle = signal<BillingCycle>('Monthly');
  protected readonly showCancelledNotice = signal(false);
  // El link de reintento del email expiró/era inválido: se cae al flujo normal con este aviso.
  protected readonly showResumeExpiredNotice = signal(false);

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
  // Elección obligatoria entre Automatic (card-on-file) y Manual (aviso por email, pago manual).
  // Null hasta que el usuario tilde una de las dos opciones; sin eso el botón de pagar sigue deshabilitado.
  protected readonly billingPreferenceMode = signal<BillingPreferenceMode | null>(null);

  // Abierto por defecto: el comprador debe ver dónde poner el código de referido y el gift code.
  protected readonly showCodeFields = signal(true);
  protected readonly referralCode = signal('');
  /** Canal y envío del enlace de referido (?ch=&sid=): solo viajan en el alta para atribuir el canal. */
  private referralChannel: string | undefined;
  private referralShareId: string | undefined;
  protected readonly promoCode = signal('');
  protected readonly giftCode = signal('');

  // No-null cuando el checkout resultó fullyCovered — solo se usa para mostrar
  // el aviso de "tu código cubrió el costo completo" (netAmountCents es 0 por
  // definición en ese caso, no hace falta guardarlo aparte).
  protected readonly discountAmountCents = signal<number | null>(null);

  protected readonly processingMessage = signal('');
  protected readonly errorMessage = signal('');

  // Espera pedida por el backend (429/503): una por acción. El botón muestra la cuenta regresiva y la
  // acción nunca se reintenta sola; lo escrito en el formulario se conserva.
  protected readonly sendCodeCooldown = new ActionCooldown();
  protected readonly resendCooldown = new ActionCooldown();
  protected readonly verifyCooldown = new ActionCooldown();
  protected readonly submitCooldown = new ActionCooldown();
  protected readonly throttledAction = signal<ThrottledAction | null>(null);
  protected readonly throttleKind = signal<ThrottleKind>('rate-limited');

  // El onboarding ya creado se reutiliza al reintentar el pago: repetir el POST crearía otro.
  private onboardingId: string | null = null;

  // Edad del processing para mostrar "Started Xmin ago. Expires in Ymin." y empuñar la ventana del sweeper (30min TTL del backend).
  private checkoutStartedAt: number | null = null;
  protected readonly processingClockTick = signal(0);
  private processingClockTimer: ReturnType<typeof setInterval> | null = null;
  protected readonly isCancellingOnboarding = signal(false);
  // bfcache: restaurar la pestaña (back del browser desde el provider) no vuelve a disparar ngOnInit.
  private readonly onPageShow = (event: PageTransitionEvent) => this.handlePageShow(event);

  /** Paso del marco: correo y código = 1, datos = 2, pago/errores = 3. */
  protected readonly stepIndex = computed(() => {
    switch (this.step()) {
      case 'details':
        return 2;
      case 'processing':
      case 'no-payment':
      case 'error':
        return 3;
      default:
        return 1;
    }
  });

  /** Plan elegido, para el pie del panel: "Pro — $129/mes". */
  protected readonly panelFootnote = computed(() => {
    const p = this.plan();
    if (!p) return '';
    const cycle = this.cycle() === 'Yearly' ? this.t().annualLabel.toLowerCase() : this.t().monthlyLabel.toLowerCase();
    return `${p.name} — $${this.planPrice}/${cycle}`;
  });

  get otpTimerDisplay(): string {
    const seconds = this.otpSecondsLeft();
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  /** Ciclos que se pueden elegir en el paso del correo; con uno solo no hay selector. */
  readonly cycleChoices = computed(() => {
    const plan = this.plan();
    return plan ? sellableCycles(plan) : [];
  });

  /** "Save 16%" en el anual, con los precios del catálogo. */
  readonly annualSavingsLabel = computed(() => {
    const plan = this.plan();
    const savings = plan ? annualSavings(plan) : null;
    return savings ? this.t().regSaveAnnual.replace('{percent}', String(savings.percent)) : '';
  });

  /** Mensual o anual en el paso del correo o en el de datos (un link de referido no trae ciclo). */
  selectCycle(cycle: BillingCycle): void {
    if (!this.cycleChoices().includes(cycle) || cycle === this.cycle() || this.isSubmittingDetails()) return;
    this.cycle.set(cycle);
    // En el paso de datos la cotización de los códigos y los métodos de pago dependen del ciclo.
    if (this.step() === 'details') {
      this.previewCodes();
      this.reloadPaymentOptions();
    }
  }

  /** Métodos del ciclo actual; conserva el elegido si sigue disponible. */
  private reloadPaymentOptions(): void {
    const plan = this.plan();
    if (!plan) return;
    const chosen = this.selectedPaymentOption();
    this.onboarding.getPaymentOptions(plan.id, this.cycle()).subscribe({
      next: (response) => {
        const options = visibleOnboardingPaymentOptions(response.options);
        this.paymentOptions.set(options);
        this.selectedPaymentOption.set(
          options.find((o) => o.provider === chosen?.provider && o.method === chosen?.method) ?? options[0] ?? null,
        );
      },
      error: () => {},
    });
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
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', this.onPageShow);
    }
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

    // Link de referido: de la URL o el guardado al llegar (pudo pasar por los planes). Se valida su forma.
    const referral = parseReferralLink(params) ?? readReferralLink(sessionStore());
    if (referral) {
      this.referralCode.set(referral.code);
      this.showCodeFields.set(true);
      this.referralChannel = referral.channel;
      this.referralShareId = referral.shareId;
    }

    // Link de una giftcard (?gift=CODE): el código llega en su campo, listo para canjear. Es un descuento, a diferencia
    // del código de referido, que solo atribuye.
    const gift = params.get('gift')?.trim();
    if (gift && /^[A-Za-z0-9-]{4,40}$/.test(gift)) {
      this.giftCode.set(gift.toUpperCase());
      this.showCodeFields.set(true);
    }

    // Link del email de "pago fallido": referencia de reanudación opaca (?r=). El comprador cae directo
    // al pago del MISMO onboarding, sin re-hacer email+OTP. Si el token expiró, se cae al flujo normal.
    const resumeReference = params.get('r');
    if (resumeReference) {
      this.resumeCheckout(resumeReference);
      return;
    }

    this.loadPlan();
  }

  /** Canjea la referencia del email por un checkout del mismo onboarding y redirige al provider. Si la
   *  referencia expiró/era inválida, cae al flujo normal (email→OTP→pago) con el plan preseleccionado
   *  por los query params y un aviso. El token es la autorización — no requiere la cookie de sesión. */
  private resumeCheckout(reference: string): void {
    this.step.set('processing');
    this.processingMessage.set(this.t().regPreparingPayment);
    const params = this.route.snapshot.queryParamMap;
    const origin = typeof window !== 'undefined' ? window.location.origin : SITE_CONFIG.websiteUrl;
    const cancelUrl = `${origin}/register?plan=${params.get('plan') ?? ''}&cycle=${this.cycle()}&cancelled=1`;

    this.onboarding
      .resumeCheckout({
        reference,
        successUrl: `${origin}/register/payment-received`,
        cancelUrl,
      })
      .subscribe({
        next: (res) => {
          this.processingMessage.set(this.t().regRedirectingPayment);
          if (typeof window !== 'undefined') {
            window.location.href = res.checkoutUrl;
          }
        },
        error: () => {
          this.showResumeExpiredNotice.set(true);
          this.loadPlan();
        },
      });
  }

  retryLoadPlan(): void {
    this.loadPlan();
  }

  /** Separado de "plan inexistente": un fallo de red/API acá es transitorio y
   *  recuperable con reintento, no lo mismo que un plan que nunca existió. */
  private loadPlan(): void {
    const planId = this.route.snapshot.queryParamMap.get('plan');
    this.step.set('loading');
    this.plansService.getPlans().subscribe({
      next: (plans) => {
        // El catálogo manda: un plan de la URL que no se vende no vale; sin plan válido se elige del catálogo.
        const sold = plans.filter((p) => sellableCycles(p).length > 0);
        const found = sold.find((p) => p.id === planId);
        if (found) {
          this.choosePlan(found);
        } else if (sold.length === 1) {
          this.choosePlan(sold[0]);
        } else if (sold.length > 1) {
          this.planChoices.set([...sold].sort((a, b) => a.rank - b.rank));
          this.step.set('choose-plan');
        } else {
          this.step.set('invalid-plan');
        }
      },
      error: () => this.step.set('load-error'),
    });
  }

  /** Fija el plan y un ciclo que ese plan venda (el de la URL si lo vende). */
  choosePlan(plan: PlanResponse): void {
    const cycles = sellableCycles(plan);
    if (!cycles.includes(this.cycle())) this.cycle.set(cycles[0]);
    this.plan.set(plan);
    this.step.set('email');
  }

  ngOnDestroy(): void {
    this.stopOtpTimer();
    this.stopProcessingClock();
    for (const cooldown of [this.sendCodeCooldown, this.resendCooldown, this.verifyCooldown, this.submitCooldown]) {
      cooldown.stop();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this.onPageShow);
    }
  }

  /** Aviso fijo mientras dura la espera de la acción que la provocó. */
  protected throttleNotice(action: ThrottledAction, cooldown: ActionCooldown): string | null {
    if (this.throttledAction() !== action || !cooldown.active()) return null;
    const t = this.t();
    return this.throttleKind() === 'overloaded' ? t.throttleOverloadedNotice : t.throttleNotice;
  }

  protected waitLabel(cooldown: ActionCooldown, template = this.t().throttleButton): string {
    return template.replace('{time}', formatClock(cooldown.secondsLeft()));
  }

  submitEmail(): void {
    if (this.isSendingCode() || this.sendCodeCooldown.active()) return;
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
        this.resendCooldown.start(RESEND_COOLDOWN_SECONDS);
      },
      error: (err) => {
        this.isSendingCode.set(false);
        this.handleError(err, 'send', this.emailError, this.sendCodeCooldown);
      },
    });
  }

  onOtpInput(value: string): void {
    this.otp.set(value.replace(/\D/g, '').slice(0, OTP_LENGTH));
  }

  resendOtp(): void {
    if (this.isResending() || this.resendCooldown.active()) return;
    this.isResending.set(true);
    this.otpError.set('');
    this.onboarding.resendEmailChallenge(this.challengeId).subscribe({
      next: () => {
        this.isResending.set(false);
        this.otp.set('');
        this.startOtpTimer();
        this.resendCooldown.start(RESEND_COOLDOWN_SECONDS);
      },
      error: (err) => {
        this.isResending.set(false);
        this.handleError(err, 'resend', this.otpError, this.resendCooldown);
      },
    });
  }

  verifyOtp(): void {
    if (this.isVerifying() || this.verifyCooldown.active()) return;
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
        this.handleError(err, 'verify', this.otpError, this.verifyCooldown);
      },
    });
  }

  /** false = el código de referido escrito ya no sirve (reemplazado, vencido o inexistente); null = sin dato. */
  protected readonly referralCodeActive = signal<boolean | null>(null);

  /** Valida el código de referido (público) al salir del campo; Continue vuelve a validarlo y no sigue si no sirve. */
  protected validateReferral(): void {
    const code = this.referralCode().trim();
    if (!code) {
      this.referralCodeActive.set(null);
      return;
    }
    this.onboarding.validateReferralCode(code).subscribe({
      next: (res) => this.referralCodeActive.set(res.isActive),
      error: () => this.referralCodeActive.set(null),
    });
  }

  /** Desglose bruto → descuento → neto con los códigos escritos; null si no hay códigos o no se pudo calcular. */
  protected readonly pricingPreview = signal<PricingPreview | null>(null);
  protected readonly pricingPreviewBusy = signal(false);

  /**
   * Cotiza (sin reservar) el precio con el promo y el gift escritos. Es informativo: si falla, no bloquea el pago;
   * el cobro real vuelve a validar los códigos. El referido no entra: no es un descuento.
   */
  protected previewCodes(): void {
    const plan = this.plan();
    const promo = this.promoCode().trim();
    const gift = this.giftCode().trim();
    if (!plan || (!promo && !gift)) {
      this.pricingPreview.set(null);
      return;
    }

    this.pricingPreviewBusy.set(true);
    this.onboarding.previewPricing(plan.id, this.cycle(), promo || undefined, gift || undefined).subscribe({
      next: (preview) => {
        this.pricingPreview.set(preview);
        this.pricingPreviewBusy.set(false);
      },
      error: () => {
        this.pricingPreview.set(null);
        this.pricingPreviewBusy.set(false);
      },
    });
  }

  /** Centavos a texto de dinero ("$104.00"). */
  protected money(cents: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  }

  /** Volver del paso OTP al de correo — por si se equivocó al escribirlo.
   *  El challenge en curso se deja morir solo (nunca se cancela server-side). */
  backToEmail(): void {
    this.stopOtpTimer();
    this.onboardingId = null;
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
    if (this.isSubmittingDetails() || this.submitCooldown.active()) return;
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
    if (!this.billingPreferenceMode()) {
      this.detailsError.set(this.t().signupBillingPrefRequired);
      return;
    }
    this.whenReferralUsable(() => this.createAndCheckout(plan));
  }

  /**
   * Un referido escrito tiene que estar activo para seguir: así un cupón puesto en ese campo no termina en un cobro a
   * precio completo sin aviso. Si la validación misma falla, no bloquea (el backend lo resuelve igual).
   */
  private whenReferralUsable(next: () => void): void {
    const code = this.referralCode().trim();
    if (!code) {
      next();
      return;
    }

    this.isSubmittingDetails.set(true);
    this.onboarding.validateReferralCode(code).subscribe({
      next: (res) => {
        this.isSubmittingDetails.set(false);
        this.referralCodeActive.set(res.isActive);
        if (res.isActive) next();
        else this.detailsError.set(this.t().regReferralCodeInactive);
      },
      error: () => {
        this.isSubmittingDetails.set(false);
        next();
      },
    });
  }

  private createAndCheckout(plan: PlanResponse): void {
    this.persistBillingPreferenceConsent();

    this.isSubmittingDetails.set(true);
    if (this.onboardingId) {
      this.startCheckout(this.onboardingId);
      return;
    }

    this.onboarding
      .createOnboarding({
        email: this.email(),
        firstName: this.firstName(),
        lastName: this.lastName(),
        phone: this.phone() || undefined,
        planId: plan.id,
        emailVerificationChallengeId: this.challengeId,
        billingCycle: this.cycle(),
        autoRenew: this.billingPreferenceMode() === 'Automatic',
      })
      .subscribe({
        next: (created) => {
          this.onboardingId = created.onboardingId;
          this.startCheckout(created.onboardingId);
        },
        error: (err) => {
          this.isSubmittingDetails.set(false);
          this.handleError(err, 'submit', this.detailsError, this.submitCooldown);
        },
      });
  }

  private startCheckout(onboardingId: string): void {
    this.isSubmittingDetails.set(false);
    this.step.set('processing');
    this.processingMessage.set(this.t().regPreparingPayment);
    this.checkoutStartedAt = Date.now();
    this.startProcessingClock();
    const origin = typeof window !== 'undefined' ? window.location.origin : SITE_CONFIG.websiteUrl;
    const plan = this.plan();
    const paymentOption = this.selectedPaymentOption();

    this.onboarding
      .startCheckout({
        onboardingId,
        payerEmail: this.email(),
        successUrl: `${origin}/register/payment-received`,
        cancelUrl: this.cancelUrl(origin, plan?.id ?? ''),
        provider: paymentOption?.provider,
        method: paymentOption?.method,
        referralCode: this.referralCode().trim() || undefined,
        referralChannel: this.referralChannel,
        referralShareId: this.referralShareId,
        promoCode: this.promoCode().trim() || undefined,
        giftCode: this.giftCode().trim() || undefined,
        storeMethodForOffSession: this.billingPreferenceMode() === 'Automatic',
      })
      .subscribe({
        next: (res) => {
          // El referido ya quedó declarado: otra alta en esta pestaña no lo hereda.
          clearReferralLink(sessionStore());
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
        error: (err) => {
          // Un 429/503 del checkout vuelve al paso de datos con la espera; el onboarding ya creado se reutiliza.
          if (readThrottle(err)) {
            this.step.set('details');
            this.handleError(err, 'submit', this.detailsError, this.submitCooldown);
            return;
          }
          // Un código que no sirve para esta persona: vuelve a los datos para quitarlo y seguir sin descuento.
          const code = apiErrorCode(err);
          if (code && CODE_REFUSED_FOR_BUYER.has(code)) {
            this.step.set('details');
            this.detailsError.set(this.mapError(code) ?? this.t().regErrorGeneric);
            return;
          }
          this.showError(err);
        },
      });
  }

  /** Volver de un checkout cancelado conserva plan, ciclo y referido. */
  private cancelUrl(origin: string, planId: string): string {
    const referral = this.referralCode().trim();
    const channelParam = referral && this.referralChannel ? `&ch=${encodeURIComponent(this.referralChannel)}` : '';
    const shareParam = referral && this.referralShareId ? `&sid=${encodeURIComponent(this.referralShareId)}` : '';
    const referralParam = referral ? `&referral=${encodeURIComponent(referral)}${channelParam}${shareParam}` : '';
    return `${origin}/register?plan=${planId}&cycle=${this.cycle()}&cancelled=1${referralParam}`;
  }

  private handleError(
    err: unknown,
    action: ThrottledAction,
    target: WritableSignal<string>,
    cooldown: ActionCooldown,
  ): void {
    const throttle = readThrottle(err);
    if (throttle) {
      this.throttleKind.set(throttle.kind);
      this.throttledAction.set(action);
      target.set('');
      cooldown.start(throttle.retryAfterSeconds);
      return;
    }
    target.set(this.mapError(apiErrorCode(err)) || this.t().regErrorGeneric);
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
        // Un gift/promo que llegó por el enlace se valida y se muestra de una vez.
        this.previewCodes();
        this.validateReferral();
      },
      error: (err) => {
        this.isVerifying.set(false);
        this.handleError(err, 'verify', this.otpError, this.verifyCooldown);
      },
    });
  }

  protected selectPaymentOption(option: OnboardingPaymentOption): void {
    if (this.isSubmittingDetails()) return;
    this.selectedPaymentOption.set(option);
  }

  /** Qué hace un código válido según su duración ("20% off for 3 months"). */
  codeLineBenefit(line: PricingPreviewLine, currency: string): string {
    if (!line.valid || !line.duration) {
      return '';
    }
    const label =
      line.percentageBasisPoints != null
        ? `${line.percentageBasisPoints / 100}%`
        : line.fixedAmountCents != null
          ? this.money(line.fixedAmountCents, currency)
          : null;
    if (!label) {
      return '';
    }
    const t = this.t();
    switch (line.duration) {
      case 'Once':
        return t.regCodeBenefitOnce.replace('{label}', label);
      case 'Forever':
        return t.regCodeBenefitForever.replace('{label}', label);
      default:
        return line.durationMonths === 1
          ? t.regCodeBenefitOneMonth.replace('{label}', label)
          : t.regCodeBenefitMonths.replace('{label}', label).replace('{months}', String(line.durationMonths ?? ''));
    }
  }

  /** Motivo de una línea de código que no aplicó en la vista previa. */
  codeLineMessage(line: PricingPreviewLine): string {
    return this.mapError(line.errorCode) ?? this.t().regCodeInvalid;
  }

  private mapError(code: string | null): string | null {
    const t = this.t();
    switch (code) {
      case 'Onboarding.CodeNotAllowedForEmail':
        return t.regCodeNotAllowedForEmail;
      case 'Onboarding.CodeAlreadyUsedByBuyer':
        return t.regCodeAlreadyUsed;
      case 'Onboarding.CodeNotStackable':
        return t.regCodeNotStackable;
      case 'Onboarding.OtpMismatch':
        return t.regOtpMismatch;
      case 'Onboarding.OtpLocked':
        return t.regOtpLocked;
      case 'Onboarding.OtpExpired':
        return t.regOtpExpired;
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

  // TTL alineado con el sweeper del backend (OnboardingExpirationOptions.TtlMinutes).
  private static readonly PROCESSING_TTL_SECONDS = 30 * 60;

  protected canCancelProcessing(): boolean {
    return !!this.onboardingId && !this.isCancellingOnboarding();
  }

  cancelOnboarding(): void {
    if (!this.onboardingId || this.isCancellingOnboarding()) return;
    this.isCancellingOnboarding.set(true);
    this.onboarding.cancelOnboarding(this.onboardingId).subscribe({
      next: () => this.redirectToCancelledNotice(),
      // Un error acá no debe atrapar al buyer en processing: igual lo devolvemos al inicio.
      error: () => this.redirectToCancelledNotice(),
    });
  }

  private redirectToCancelledNotice(): void {
    this.stopProcessingClock();
    this.isCancellingOnboarding.set(false);
    this.onboardingId = null;
    const plan = this.plan();
    this.router.navigate(['/register'], {
      queryParams: { plan: plan?.id ?? '', cycle: this.cycle(), cancelled: '1' },
      replaceUrl: true,
    });
  }

  protected processingAgeLabel(): string | null {
    if (!this.checkoutStartedAt) return null;
    void this.processingClockTick();
    const elapsed = Math.max(0, Math.floor((Date.now() - this.checkoutStartedAt) / 1000));
    const remaining = Math.max(0, RegisterComponent.PROCESSING_TTL_SECONDS - elapsed);
    return this.t()
      .regProcessingStartedAgo
      .replace('{ago}', this.formatMinutes(elapsed))
      .replace('{remaining}', this.formatMinutes(remaining));
  }

  private formatMinutes(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes <= 0) return '< 1 min';
    return minutes === 1 ? '1 min' : `${minutes} min`;
  }

  private startProcessingClock(): void {
    this.stopProcessingClock();
    this.processingClockTick.set(0);
    this.processingClockTimer = setInterval(() => {
      this.processingClockTick.set(this.processingClockTick() + 1);
    }, 15000);
  }

  private stopProcessingClock(): void {
    if (this.processingClockTimer !== null) {
      clearInterval(this.processingClockTimer);
      this.processingClockTimer = null;
    }
  }

  /** Texto EXACTO del radio Automatic con los valores que el usuario ve en pantalla. Es lo que se guarda
   *  como `consentText` al llamar al backend — mismo string que mostró la UI, no una copia inventada. */
  protected automaticConsentText(): string {
    return this.t()
      .signupBillingPrefAutomatic.replace('{brand}', this.brand)
      .replace('{amount}', this.formattedAmount())
      .replace('{cadence}', this.formattedCadence());
  }

  protected manualConsentText(): string {
    return this.t().signupBillingPrefManual;
  }

  private formattedAmount(): string {
    const price = this.planPrice;
    try {
      return new Intl.NumberFormat(this.translation.lang(), {
        style: 'currency',
        currency: 'USD',
      }).format(price);
    } catch {
      return `$${price}`;
    }
  }

  private formattedCadence(): string {
    return this.cycle() === 'Yearly'
      ? this.t().annualLabel.toLowerCase()
      : this.t().monthlyLabel.toLowerCase();
  }

  /** Guarda la elección + texto exacto que vio el usuario en sessionStorage: ni el register, ni el
   *  payment-received, tienen una sesión autenticada para hablar con Subscription — pero /register/complete
   *  sí la crea al terminar. Ahí se consume este breadcrumb para hacer POST /subscriptions/me/billing-preference. */
  private persistBillingPreferenceConsent(): void {
    const mode = this.billingPreferenceMode();
    if (!mode || typeof window === 'undefined') return;
    const consent: PendingBillingPreferenceConsent = {
      mode,
      providerCode: 'stripe',
      consentText: mode === 'Automatic' ? this.automaticConsentText() : this.manualConsentText(),
      consentTextVersion: BILLING_PREFERENCE_CONSENT_VERSION,
      capturedAtUtc: new Date().toISOString(),
    };
    try {
      window.sessionStorage.setItem(BILLING_PREF_CONSENT_STORAGE_KEY, JSON.stringify(consent));
    } catch {
      // sessionStorage puede estar bloqueado (modo privado); el flujo sigue, el POST igual se intentará
      // cuando el usuario ya tenga sesión, con los defaults mínimos.
    }
  }

  // bfcache: Safari/Firefox restauran la pestaña con el DOM intacto al apretar "atrás" desde el provider.
  // Si no tenemos onboardingId en memoria (reinicio real), volvemos al paso del email.
  private handlePageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return;
    if (this.step() !== 'processing') return;
    if (!this.onboardingId) {
      this.stopProcessingClock();
      this.checkoutStartedAt = null;
      this.step.set('email');
    }
  }
}

/** Ciclos que el alta vende y que el plan tiene con precio. */
function sellableCycles(plan: PlanResponse): BillingCycle[] {
  return (['Monthly', 'Yearly'] as const).filter((cycle) => plan.pricesUsdByCycle?.[cycle] != null);
}
