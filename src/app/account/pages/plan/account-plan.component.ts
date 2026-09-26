import { Component, computed, inject, signal } from '@angular/core';
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

/** Qué está haciendo la zona de riesgo. */
type CancelStage = 'idle' | 'confirming' | 'working';

/** En qué punto del cambio está la pantalla. */
type Stage = 'browsing' | 'previewing' | 'confirming' | 'done';

/** Lo que pasó con el pago al volver del proveedor. */
type CheckoutOutcome = 'none' | 'paid' | 'cancelled';

@Component({
  selector: 'app-account-plan',
  imports: [StepUpDialogComponent],
  templateUrl: './account-plan.component.html',
})
export class AccountPlanComponent {
  private readonly api = inject(AccountSubscriptionService);
  private readonly plansApi = inject(PlansService);
  private readonly session = inject(AccountSessionStore);
  private readonly i18n = inject(TranslationStore);

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
  /** Qué acción reintentar cuando el usuario confirme su contraseña. */
  private readonly pendingAction = signal<'change' | 'cancel'>('change');
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
    }).subscribe({
      next: ({ subscription, plans }) => {
        this.subscription.set(subscription);
        this.plans.set([...plans].sort((a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd));
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

  confirm(): void {
    const preview = this.preview();
    if (!preview || preview.blocked || this.stage() === 'confirming') {
      return;
    }
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

  /** Arranca la renovación y sale al proveedor; al volver, la pantalla ya refleja el pago. */
  renew(): void {
    const email = this.session.me()?.email;
    if (this.renewing() || !email) {
      return;
    }
    this.renewing.set(true);
    this.error.set(null);
    const back = `${window.location.origin}/account/plan`;
    this.api
      .startRenewCheckout({
        payerEmail: email,
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
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
    if (this.pendingAction() === 'cancel') {
      this.confirmCancel();
      return;
    }
    this.confirm();
  }

  onStepUpDismissed(): void {
    this.stepUpNeeded.set(false);
    if (this.pendingAction() === 'cancel') {
      this.cancelStage.set('confirming');
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
