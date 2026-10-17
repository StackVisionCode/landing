import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AccountSubscription,
  PlanChangePreview,
} from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { TranslationStore } from '@core/i18n/translation.store';
import { moduleLabel } from '@core/plans/module-labels';
import { PlanResponse } from '@core/plans/plans.models';
import { PlansService } from '@core/plans/plans.service';
import { StepUpDialogComponent } from '../../shared/step-up-dialog.component';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock } from '@core/http/throttling';
import { throttleNotice } from '@account/shared/account-throttle';
import { ConfirmDialogComponent } from '@account/shared/confirm-dialog.component';
import { PaymentProviderPickerComponent } from '@account/shared/payment-provider-picker.component';
import { AccountPaymentOption } from '@core/account/account-payment-options.service';
import {
  BILLING_PREFERENCE_CONSENT_VERSION,
  BillingPreference,
  BillingPreferenceService,
} from '@core/account/billing-preference.service';

/** Qué está haciendo la zona de riesgo. */
type CancelStage = 'idle' | 'confirming' | 'working';

/** En qué punto del cambio está la pantalla. */
type Stage = 'browsing' | 'previewing' | 'confirming' | 'done';

/** Lo que pasó con el pago al volver del proveedor. */
type CheckoutOutcome = 'none' | 'paid' | 'cancelled';

@Component({
  selector: 'app-account-plan',
  imports: [StepUpDialogComponent, ConfirmDialogComponent, PaymentProviderPickerComponent],
  templateUrl: './account-plan.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AccountPlanComponent {
  private readonly api = inject(AccountSubscriptionService);
  private readonly plansApi = inject(PlansService);
  private readonly session = inject(AccountSessionStore);
  private readonly i18n = inject(TranslationStore);
  private readonly billingPrefApi = inject(BillingPreferenceService);

  readonly t = this.i18n.t;
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly subscription = signal<AccountSubscription | null>(null);
  readonly plans = signal<PlanResponse[]>([]);

  readonly preview = signal<PlanChangePreview | null>(null);
  readonly stage = signal<Stage>('browsing');
  readonly error = signal<string | null>(null);
  readonly outcome = signal<string | null>(null);
  /** El backend pidió confirmar la contraseña: se muestra el diálogo y luego se reintenta. */
  readonly stepUpNeeded = signal(false);
  readonly checkoutOutcome = signal<CheckoutOutcome>('none');
  readonly renewing = signal(false);
  readonly cancelStage = signal<CancelStage>('idle');
  readonly cancelReason = signal('');
  readonly cancelError = signal<string | null>(null);
  readonly cancellingUpgrade = signal(false);
  /** Mensaje efímero de la cancelación del upgrade: éxito / idempotente / error. */
  readonly upgradeCancelNotice = signal<{ kind: 'ok' | 'already' | 'error' } | null>(null);
  /** Qué acción reintentar cuando el usuario confirme su contraseña. */
  private readonly pendingAction = signal<'change' | 'cancel' | 'switch-automatic' | 'update-card'>('change');
  /** Un 429 bloquea el botón con la espera real del backend en vez de contarse como fallo. */
  protected readonly cooldown = new ActionCooldown();
  readonly waiting = this.cooldown.active;
  readonly waitLabel = computed(() => `${this.t().accWaitPrefix} ${formatClock(this.cooldown.secondsLeft())}`);


  readonly currentCode = computed(() => this.subscription()?.plan.code ?? null);
  readonly cycle = computed(() => this.subscription()?.plan.billingCycle ?? 'Monthly');
  readonly isEmpty = computed(() => this.plans().length === 0);
  /** Upgrade a medio pagar: mientras la sesión viva, se retoma en vez de abrir otro cobro. */
  readonly openUpgrade = computed(() => this.subscription()?.pendingPlanChange?.checkoutUrl ?? null);
  readonly cancelScheduled = computed(() => this.subscription()?.period.cancelAtPeriodEnd === true);

  /**
   * El acceso está cortado por falta de pago. Es lo único que importa en ese estado, así que la pantalla lo
   * pone arriba con el botón de pagar: antes el Account decía que estaba bloqueado y no ofrecía salida, y
   * quien se quedaba sin acceso tenía que volver al espacio de trabajo a renovar.
   */
  readonly needsRenewal = computed(() => this.subscription()?.plan.billingAccessBlocked === true);

  readonly accessEndsLabel = computed(() => {
    const period = this.subscription()?.period;
    return period ? this.date(period.currentPeriodEndUtc) : '';
  });

  // Preferencia de facturación y mandato guardado.
  readonly billingPreference = signal<BillingPreference | null>(null);
  readonly billingPreferenceFailed = signal(false);
  readonly billingPreferenceSwitching = signal(false);
  readonly billingPreferenceSwitchError = signal<string | null>(null);
  readonly switchToAutomaticOpen = signal(false);
  readonly switchToManualOpen = signal(false);

  readonly isAutomaticBilling = computed(() => this.billingPreference()?.mode === 'Automatic');
  readonly isManualBilling = computed(() => this.billingPreference()?.mode === 'Manual');
  readonly hasSavedCard = computed(() => !!this.billingPreference()?.defaultPaymentMethod);
  /** Hoy solo Stripe soporta Checkout mode=setup (cambiar tarjeta sin cobrar). En PayPal el usuario
   *  administra su wallet directamente, así que ocultamos el botón y mostramos el aviso. */
  readonly canUpdateCard = computed(() => {
    const provider = this.billingPreference()?.providerCode;
    return !provider || provider.toLowerCase() === 'stripe';
  });
  readonly providerManagedCardLabel = computed(() => {
    const provider = this.billingPreference()?.providerCode ?? '';
    return this.t().accBillingPrefProviderManagedCard.replace('{provider}', provider);
  });
  readonly savedCardLabel = computed(() => {
    const pm = this.billingPreference()?.defaultPaymentMethod;
    if (!pm) return '';
    const month = String(pm.expMonth).padStart(2, '0');
    const year = String(pm.expYear).slice(-2);
    return `${pm.brand} •••• ${pm.last4} · ${this.t().accBillingPrefExpires} ${month}/${year}`;
  });
  readonly nextChargeLabel = computed(() => {
    const next = this.subscription()?.period.nextRenewalAtUtc;
    const pref = this.billingPreference();
    if (!next || !pref) return '';
    const plan = this.subscription()?.plan;
    const amount =
      pref.agreedAmountCents != null && pref.agreedCurrency
        ? this.money(pref.agreedAmountCents, pref.agreedCurrency)
        : plan
          ? this.money(plan.currentCyclePriceCents, plan.currency)
          : '';
    return `${this.t().accBillingPrefNextCharge}: ${this.date(next)} · ${amount}`;
  });

  constructor() {
    // El proveedor devuelve al usuario acá tras pagar el upgrade.
    const returned = inject(ActivatedRoute).snapshot.queryParamMap.get('checkout');
    this.checkoutOutcome.set(returned === 'success' ? 'paid' : returned === 'cancelled' ? 'cancelled' : 'none');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({
      subscription: this.api.get(),
      plans: this.plansApi.getPlans().pipe(catchError(() => of([] as PlanResponse[]))),
      billingPreference: this.billingPrefApi.get().pipe(catchError(() => of(null as BillingPreference | null))),
    }).subscribe({
      next: ({ subscription, plans, billingPreference }) => {
        this.subscription.set(subscription);
        this.plans.set([...plans].sort((a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd));
        this.billingPreference.set(billingPreference);
        this.billingPreferenceFailed.set(billingPreference === null);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Nada se pide sin ver antes qué pasaría: el total y la fecha los calcula el backend. */
  choose(plan: PlanResponse): void {
    if (plan.code === this.currentCode()) {
      this.error.set(this.t().accPlanSame);
      return;
    }
    this.stage.set('previewing');
    this.error.set(null);
    this.outcome.set(null);
    this.api.planChangePreview(plan.code, this.cycle()).subscribe({
      next: preview => this.preview.set(preview),
      error: err => {
        this.stage.set('browsing');
        this.error.set(this.messageFor(err));
      },
    });
  }

  back(): void {
    this.preview.set(null);
    this.stage.set('browsing');
    this.error.set(null);
  }

  /** `change` cuando el preview es un upgrade cobrable; `renew` cuando el usuario pulsó renew. */
  readonly pickerIntent = signal<'change' | 'renew' | null>(null);
  readonly pickerOpen = computed(() => this.pickerIntent() !== null);

  confirm(): void {
    const preview = this.preview();
    if (!preview || preview.blocked || this.stage() === 'confirming') {
      return;
    }
    // Downgrades no cobran: van off-session sin provider. Solo los upgrades abren el picker.
    if (!preview.chargedNow) {
      this.executeChangePlan(null);
      return;
    }
    this.pickerIntent.set('change');
  }

  onProviderPickerDismissed(): void {
    this.pickerIntent.set(null);
  }

  onProviderPicked(option: AccountPaymentOption): void {
    const intent = this.pickerIntent();
    this.pickerIntent.set(null);
    if (intent === 'change') {
      this.executeChangePlan(option);
    } else if (intent === 'renew') {
      this.executeRenew(option);
    }
  }

  private executeChangePlan(option: AccountPaymentOption | null): void {
    const preview = this.preview();
    if (!preview) return;
    this.stage.set('confirming');
    this.error.set(null);
    this.pendingAction.set('change');
    const back = `${window.location.origin}/account/plan`;
    this.api
      .changePlan({
        planCode: preview.toPlanCode,
        billingCycle: preview.billingCycle,
        // Un upgrade se paga por redirect: es el único camino sin método en archivo.
        payerEmail: preview.chargedNow ? (this.session.me()?.email ?? null) : null,
        successUrl: preview.chargedNow ? `${back}?checkout=success` : null,
        cancelUrl: preview.chargedNow ? `${back}?checkout=cancelled` : null,
        provider: option?.provider,
        method: option?.method,
      })
      .subscribe({
      next: response => {
        if (response?.checkoutUrl) {
          window.location.assign(response.checkoutUrl);
          return;
        }
        this.stage.set('done');
        this.outcome.set(
          preview.chargedNow ? this.t().accPlanUpgradeStarted : this.t().accPlanDowngradeScheduled
        );
        this.preview.set(null);
        this.load();
      },
      error: (err: unknown) => {
        this.stage.set('previewing');
        if (apiErrorCode(err) === 'Auth.ReauthenticationRequired') {
          this.stepUpNeeded.set(true);
          return;
        }
        this.error.set(this.messageFor(err));
      },
    });
  }

  readonly cancelUpgradeConfirmOpen = signal(false);

  openCancelUpgradeConfirm(): void {
    if (this.cancellingUpgrade()) return;
    this.cancelUpgradeConfirmOpen.set(true);
  }

  dismissCancelUpgradeConfirm(): void {
    this.cancelUpgradeConfirmOpen.set(false);
  }

  /** Cierra el upgrade AwaitingPayment: libera el intent y permite elegir otro plan sin cobro extra. */
  cancelUpgrade(): void {
    this.cancelUpgradeConfirmOpen.set(false);
    if (this.cancellingUpgrade()) {
      return;
    }
    this.cancellingUpgrade.set(true);
    this.upgradeCancelNotice.set(null);
    this.api.cancelPendingUpgrade().subscribe({
      next: response => {
        this.cancellingUpgrade.set(false);
        this.upgradeCancelNotice.set({ kind: response.alreadyCancelled ? 'already' : 'ok' });
        this.load();
      },
      error: () => {
        this.cancellingUpgrade.set(false);
        this.upgradeCancelNotice.set({ kind: 'error' });
      },
    });
  }

  /** Arranca la renovación — primero elige provider en el picker, luego sale al proveedor. */
  renew(): void {
    if (this.renewing() || !this.session.me()?.email) return;
    this.error.set(null);
    this.pickerIntent.set('renew');
  }

  private executeRenew(option: AccountPaymentOption): void {
    const email = this.session.me()?.email;
    if (!email) return;
    this.renewing.set(true);
    const back = `${window.location.origin}/account/plan`;
    this.api
      .startRenewCheckout({
        payerEmail: email,
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
        provider: option.provider,
        method: option.method,
      })
      .subscribe({
        next: checkout => window.location.assign(checkout.checkoutUrl),
        error: (err: unknown) => {
          this.renewing.set(false);
          this.error.set(this.messageFor(err));
        },
      });
  }

  /** Ya confirmó su contraseña: se reintenta lo que el backend había rechazado. */
  onStepUpConfirmed(): void {
    this.stepUpNeeded.set(false);
    const action = this.pendingAction();
    if (action === 'cancel') {
      this.confirmCancel();
      return;
    }
    if (action === 'switch-automatic') {
      this.confirmSwitchToAutomatic();
      return;
    }
    if (action === 'update-card') {
      this.updateCard();
      return;
    }
    this.confirm();
  }

  onStepUpDismissed(): void {
    this.stepUpNeeded.set(false);
    const action = this.pendingAction();
    if (action === 'cancel') {
      this.cancelStage.set('confirming');
      return;
    }
    if (action === 'switch-automatic') {
      this.switchToAutomaticOpen.set(true);
      return;
    }
    if (action === 'update-card') {
      // El usuario descartó el step-up; no abrimos otro checkout, el botón vuelve a estar disponible.
      return;
    }
    this.stage.set('previewing');
  }

  openCancel(): void {
    this.cancelStage.set('confirming');
    this.cancelError.set(null);
    this.outcome.set(null);
  }

  dismissCancel(): void {
    this.cancelStage.set('idle');
    this.cancelReason.set('');
    this.cancelError.set(null);
  }

  /** Cancelar no corta nada hoy: solo marca el fin del período. El backend exige contraseña (D5). */
  confirmCancel(): void {
    if (this.cancelStage() === 'working') {
      return;
    }
    this.cancelStage.set('working');
    this.cancelError.set(null);
    this.pendingAction.set('cancel');
    this.api.cancelSubscription(this.cancelReason().trim() || 'Not specified').subscribe({
      next: () => {
        this.cancelStage.set('idle');
        this.cancelReason.set('');
        this.outcome.set(this.t().accCancelDone.replace('{date}', this.accessEndsLabel()));
        this.load();
      },
      error: (err: unknown) => {
        this.cancelStage.set('confirming');
        if (apiErrorCode(err) === 'Auth.ReauthenticationRequired') {
          this.stepUpNeeded.set(true);
          return;
        }
        this.cancelError.set(this.t().accCancelError);
      },
    });
  }

  /** Deshacer la cancelación no cobra nada ni pide contraseña. */
  resume(): void {
    if (this.cancelStage() === 'working') {
      return;
    }
    this.cancelStage.set('working');
    this.cancelError.set(null);
    this.api.resumeSubscription().subscribe({
      next: () => {
        this.cancelStage.set('idle');
        this.outcome.set(this.t().accResumeDone);
        this.load();
      },
      error: () => {
        this.cancelStage.set('idle');
        this.cancelError.set(this.t().accResumeError);
      },
    });
  }

  /** Texto EXACTO que verá el usuario en el modal de confirmación: es el mismo string que viaja al backend. */
  switchToAutomaticConsentText(): string {
    return this.t().accBillingPrefSwitchToAutomaticConfirm;
  }

  switchToManualConsentText(): string {
    return this.t().accBillingPrefSwitchToManualConfirm;
  }

  openSwitchToAutomatic(): void {
    if (this.billingPreferenceSwitching()) return;
    this.billingPreferenceSwitchError.set(null);
    this.switchToAutomaticOpen.set(true);
  }

  dismissSwitchToAutomatic(): void {
    this.switchToAutomaticOpen.set(false);
  }

  openSwitchToManual(): void {
    if (this.billingPreferenceSwitching()) return;
    this.billingPreferenceSwitchError.set(null);
    this.switchToManualOpen.set(true);
  }

  dismissSwitchToManual(): void {
    this.switchToManualOpen.set(false);
  }

  /** Cambia a Automatic. Si no hay card-on-file, el backend igual acepta la preferencia; además abrimos un
   *  checkout en modo "store method" para que el usuario agregue tarjeta — así el mandato queda viable
   *  antes del próximo cobro. */
  confirmSwitchToAutomatic(): void {
    if (this.billingPreferenceSwitching()) return;
    this.switchToAutomaticOpen.set(false);
    this.billingPreferenceSwitching.set(true);
    this.billingPreferenceSwitchError.set(null);
    this.pendingAction.set('switch-automatic');
    this.billingPrefApi
      .set({
        mode: 'Automatic',
        providerCode: 'stripe',
        consentText: this.switchToAutomaticConsentText(),
        consentTextVersion: BILLING_PREFERENCE_CONSENT_VERSION,
      })
      .subscribe({
        next: (next) => {
          this.billingPreference.set(next);
          this.billingPreferenceSwitching.set(false);
          if (!next.defaultPaymentMethod) {
            this.updateCard();
          }
        },
        error: (err: unknown) => {
          this.billingPreferenceSwitching.set(false);
          if (apiErrorCode(err) === 'Auth.ReauthenticationRequired') {
            this.stepUpNeeded.set(true);
            return;
          }
          this.billingPreferenceSwitchError.set(this.t().accBillingPrefSwitchError);
        },
      });
  }

  confirmSwitchToManual(): void {
    if (this.billingPreferenceSwitching()) return;
    this.switchToManualOpen.set(false);
    this.billingPreferenceSwitching.set(true);
    this.billingPreferenceSwitchError.set(null);
    this.billingPrefApi
      .set({
        mode: 'Manual',
        consentText: this.switchToManualConsentText(),
        consentTextVersion: BILLING_PREFERENCE_CONSENT_VERSION,
      })
      .subscribe({
        next: (next) => {
          this.billingPreference.set(next);
          this.billingPreferenceSwitching.set(false);
        },
        error: () => {
          this.billingPreferenceSwitching.set(false);
          this.billingPreferenceSwitchError.set(this.t().accBillingPrefSwitchError);
        },
      });
  }

  /** Reemplaza el PM default guardado. Usa un Checkout en modo "setup" — captura la tarjeta sin cobrar, el
   *  webhook atacha el método como nuevo default y detacha el viejo. Antes esto reusaba el renew-checkout
   *  y cobraba un ciclo entero sin querer. */
  updateCard(): void {
    if (this.renewing()) return;
    this.renewing.set(true);
    this.billingPreferenceSwitchError.set(null);
    this.pendingAction.set('update-card');
    const back = `${window.location.origin}/account/plan`;
    const payerEmail = this.session.me()?.email ?? null;
    this.billingPrefApi
      .startSetupSession(`${back}?checkout=success`, `${back}?checkout=cancelled`, payerEmail)
      .subscribe({
        next: (session) => window.location.assign(session.checkoutUrl),
        error: (err: unknown) => {
          this.renewing.set(false);
          const code = apiErrorCode(err);
          if (code === 'Auth.ReauthenticationRequired') {
            this.stepUpNeeded.set(true);
            return;
          }
          if (code === 'PaymentMethodSetup.ProviderNotSupported') {
            this.billingPreferenceSwitchError.set(this.providerManagedCardLabel());
            return;
          }
          this.billingPreferenceSwitchError.set(this.t().accBillingPrefSwitchError);
        },
      });
  }

  priceLabel(plan: PlanResponse): string {
    const price = plan.pricesUsdByCycle[this.cycle()] ?? plan.monthlyPriceUsd;
    const template = this.cycle() === 'Yearly' ? this.t().accOvPerYear : this.t().accOvPerMonth;
    return template.replace('{price}', this.usd(price));
  }

  seatsLabel(plan: PlanResponse): string {
    return this.t().accPlanSeats.replace('{count}', String(plan.maxUsers));
  }

  featuresOf(plan: PlanResponse): string[] {
    return plan.enabledModules.map(module => moduleLabel(module, this.i18n.lang()));
  }

  /** Presentational: every module offered by any plan, as comparison rows. */
  readonly moduleRows = computed(() => {
    const codes: string[] = [];
    for (const plan of this.plans()) {
      for (const code of plan.enabledModules) {
        if (!codes.includes(code)) {
          codes.push(code);
        }
      }
    }
    return codes.map(code => ({ code, label: moduleLabel(code, this.i18n.lang()) }));
  });

  hasModule(plan: PlanResponse, code: string): boolean {
    return plan.enabledModules.includes(code);
  }

  readonly storageRowLabel = computed(() => (this.i18n.lang() === 'es' ? 'Almacenamiento' : 'Storage'));

  storageLabel(plan: PlanResponse): string {
    const gb = plan.storageQuotaBytes / 1024 ** 3;
    return gb >= 1 ? `${Math.round(gb * 10) / 10} GB` : `${Math.round(plan.storageQuotaBytes / 1024 ** 2)} MB`;
  }

  isCurrent(plan: PlanResponse): boolean {
    return plan.code === this.currentCode();
  }

  /** Qué dice la vista previa, en una frase. */
  readonly previewLabel = computed(() => {
    const preview = this.preview();
    if (!preview) {
      return '';
    }
    if (preview.chargedNow) {
      return this.t().accPlanUpgradeTotal.replace('{total}', this.money(preview.amountCents, preview.currency));
    }
    return this.t()
      .accPlanDowngradeFrom.replace('{date}', preview.effectiveAtUtc ? this.date(preview.effectiveAtUtc) : '')
      .replace('{plan}', preview.toPlanName);
  });

  readonly pendingLabel = computed(() => {
    const pending = this.subscription()?.pendingPlanChange;
    return pending ? this.t().accPlanPendingBody.replace('{plan}', pending.toPlanCode) : '';
  });

  readonly seatsAfterLabel = computed(() => {
    const preview = this.preview();
    return preview?.occupiedSeats === null || preview === null
      ? ''
      : this.t()
          .accPlanSeatsAfter.replace('{seats}', String(preview.seatsAfterChange))
          .replace('{used}', String(preview.occupiedSeats));
  });

  private messageFor(err: unknown): string {
    const t = this.t();
    const throttled = throttleNotice(err, this.cooldown, t);
    if (throttled) {
      return throttled;
    }
    switch (apiErrorCode(err)) {
      case 'Subscription.DowngradeExceedsSeats':
        return t.accPlanBlockedSeats;
      case 'PlanChangeRequest.PaymentInProgress':
        return t.accPlanInProgress;
      default:
        return t.accPlanChangeError;
    }
  }

  private usd(amount: number): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency: 'USD' }).format(amount);
  }

  private money(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(cents / 100);
  }

  private date(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang(), { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
