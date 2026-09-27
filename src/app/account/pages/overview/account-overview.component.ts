import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AccountSessionStore } from '@core/auth/account-session.store';
import {
  AccountAddOn,
  AccountSubscription,
  TenantLimits,
} from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { apiErrorCode } from '@core/http/api-error';
import { TranslationStore } from '@core/i18n/translation.store';
import { moduleLabel } from '@core/plans/module-labels';

/** Chip de estado: el tono lo decide el estado de la suscripción, no el texto. */
type StatusTone = 'ok' | 'warn' | 'danger';

@Component({
  selector: 'app-account-overview',
  imports: [RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './account-overview.component.html',
})
export class AccountOverviewComponent {
  private readonly session = inject(AccountSessionStore);
  private readonly api = inject(AccountSubscriptionService);
  private readonly i18n = inject(TranslationStore);

  readonly t = this.i18n.t;
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly subscription = signal<AccountSubscription | null>(null);
  /** Null cuando Auth no pudo responder: se muestra el total sin el "usados". */
  readonly limits = signal<TenantLimits | null>(null);
  readonly undoing = signal(false);
  readonly undoError = signal<string | null>(null);

  /** Solo un downgrade agendado se deshace; un upgrade se resuelve solo con el cobro. */
  readonly canUndoPending = computed(() => this.subscription()?.pendingPlanChange?.kind === 'Downgrade');

  readonly subtitle = computed(() =>
    this.t().accOverviewSubtitle.replace('{office}', this.session.me()?.tenant.name ?? '')
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({
      subscription: this.api.get(),
      // Los asientos usados son un extra: si Auth falla, la pantalla sigue sirviendo.
      limits: this.api.limits().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ subscription, limits }) => {
        this.subscription.set(subscription);
        this.limits.set(limits);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  readonly statusLabel = computed(() => {
    const t = this.t();
    switch (this.subscription()?.plan.status) {
      case 'Trialing':
        return t.accOvStatusTrialing;
      case 'PastDue':
        return t.accOvStatusPastDue;
      case 'GracePeriod':
        return t.accOvStatusGracePeriod;
      case 'Suspended':
        return t.accOvStatusSuspended;
      case 'Cancelled':
        return t.accOvStatusCancelled;
      case 'Expired':
        return t.accOvStatusExpired;
      default:
        return t.accOvStatusActive;
    }
  });

  readonly statusTone = computed<StatusTone>(() => {
    switch (this.subscription()?.plan.status) {
      case 'PastDue':
      case 'GracePeriod':
        return 'warn';
      case 'Suspended':
      case 'Expired':
      case 'Cancelled':
        return 'danger';
      default:
        return 'ok';
    }
  });

  readonly priceLabel = computed(() => {
    const plan = this.subscription()?.plan;
    if (!plan) {
      return '';
    }
    const cycle = plan.billingCycle === 'Yearly' ? this.t().accOvPerYear : this.t().accOvPerMonth;
    return `${this.money(plan.currentCyclePriceCents, plan.currency)} ${cycle}`;
  });

  /** Qué fecha importa ahora: primero la prueba, luego el corte si va a terminar, y si no la renovación. */
  readonly nextDateLabel = computed(() => {
    const data = this.subscription();
    if (!data) {
      return '';
    }
    const t = this.t();
    const { period, plan } = data;
    if (plan.status === 'Trialing' && period.trialEndsAtUtc) {
      return t.accOvTrialEnds.replace('{date}', this.date(period.trialEndsAtUtc));
    }
    if (period.cancelledAtUtc || plan.status === 'Cancelled') {
      return t.accOvAccessEnds.replace('{date}', this.date(period.currentPeriodEndUtc));
    }
    if (period.gracePeriodEndsAtUtc) {
      return t.accOvAccessEnds.replace('{date}', this.date(period.gracePeriodEndsAtUtc));
    }
    return period.nextRenewalAtUtc
      ? t.accOvNextCharge.replace('{date}', this.date(period.nextRenewalAtUtc))
      : t.accOvNoRenewal;
  });

  readonly seatsLabel = computed(() => {
    const seats = this.subscription()?.seats;
    if (!seats) {
      return '';
    }
    const used = this.limits()?.activeUsers;
    return used === undefined
      ? this.t().accOvSeatsTotal.replace('{total}', String(seats.total))
      : this.t().accOvSeatsUsed.replace('{used}', String(used)).replace('{total}', String(seats.total));
  });

  readonly seatsBreakdown = computed(() => {
    const seats = this.subscription()?.seats;
    return seats
      ? this.t()
          .accOvSeatsBreakdown.replace('{included}', String(seats.includedInPlan))
          .replace('{purchased}', String(seats.purchased))
      : '';
  });

  /** Porcentaje de asientos en uso para la barra; sin el dato de Auth no se dibuja. */
  readonly seatsPercent = computed(() => {
    const seats = this.subscription()?.seats;
    const used = this.limits()?.activeUsers;
    if (!seats?.total || used === undefined) {
      return null;
    }
    return Math.min(100, Math.round((used / seats.total) * 100));
  });

/** Cuánto falta para el próximo cobro, que es lo que de verdad se pregunta al mirar una fecha. */
  readonly renewsInLabel = computed(() => {
    const period = this.subscription()?.period;
    const target = period?.cancelAtPeriodEnd ? period.currentPeriodEndUtc : period?.nextRenewalAtUtc;
    if (!target) {
      return null;
    }
    const days = Math.ceil((new Date(target).getTime() - Date.now()) / 86_400_000);
    if (days < 0) {
      return null;
    }
    if (days === 0) return this.t().accOvRenewsToday;
    return (days === 1 ? this.t().accOvRenewsInDay : this.t().accOvRenewsInDays).replace('{days}', String(days));
  });

  readonly activeAddOns = computed(
    () => this.subscription()?.addOns.filter(addOn => addOn.eligibility === 'Active').length ?? 0
  );

  readonly activeAddOnsLabel = computed(() => {
    const active = this.activeAddOns();
    return (active === 1 ? this.t().accOvAddOnActiveCount : this.t().accOvAddOnActiveCountPlural).replace(
      '{count}',
      String(active)
    );
  });

  readonly addOnsSummary = computed(() => {
    const addOns = this.subscription()?.addOns ?? [];
    const included = addOns.filter(addOn => addOn.eligibility === 'Included').length;
    const available = addOns.filter(addOn => addOn.eligibility === 'Available').length;
    return this.t()
      .accOvAddOnsSummary.replace('{included}', String(included))
      .replace('{available}', String(available));
  });

  readonly openSeatCheckoutLabel = computed(() => {
    const pending = this.subscription()?.openSeatCheckout;
    return pending
      ? this.t()
          .accOvOpenSeatCheckout.replace('{quantity}', String(pending.quantity))
          .replace('{total}', this.money(pending.totalCents, pending.currency))
      : '';
  });

  readonly pendingLabel = computed(() => {
    const pending = this.subscription()?.pendingPlanChange;
    if (!pending) {
      return null;
    }
    const t = this.t();
    if (pending.kind === 'Downgrade') {
      return t.accOvPendingDowngrade
        .replace('{plan}', pending.toPlanCode)
        .replace('{date}', pending.effectiveAtUtc ? this.date(pending.effectiveAtUtc) : '');
    }
    const template = pending.status === 'PaymentFailed' ? t.accOvPendingUpgradeFailed : t.accOvPendingUpgrade;
    return template.replace('{plan}', pending.toPlanCode);
  });

  /** Mismo criterio que la pantalla de Add-ons: el nombre visible sale de `MODULE_LABELS`. */
  displayName(addOn: AccountAddOn): string {
    const [module] = addOn.modules ?? [];
    return module ? moduleLabel(module, this.i18n.lang()) : addOn.name;
  }

  addOnStatusLabel(addOn: AccountAddOn): string {
    const t = this.t();
    if (addOn.eligibility === 'Included') return t.accOvAddOnIncluded;
    return addOn.eligibility === 'Active' ? t.accOvAddOnActive : t.accOvAddOnAvailable;
  }

  addOnDetail(addOn: AccountAddOn): string {
    if (addOn.eligibility === 'Included') {
      return '';
    }
    if (addOn.eligibility === 'Active') {
      if (!addOn.currentPeriodEndUtc) {
        return '';
      }
      const template = addOn.autoRenew ? this.t().accOvAddOnRenews : this.t().accOvAddOnEndsOn;
      return template.replace('{date}', this.date(addOn.currentPeriodEndUtc));
    }
    return addOn.unitAmountCents === null ? '' : this.money(addOn.unitAmountCents, addOn.currency ?? 'USD');
  }

  private money(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(cents / 100);
  }

  /** Deshace el downgrade agendado y vuelve a leer la suscripción, que es la que manda. */
  undoPendingChange(): void {
    if (this.undoing()) {
      return;
    }
    this.undoing.set(true);
    this.undoError.set(null);
    this.api.cancelPendingPlanChange().subscribe({
      next: () => {
        this.undoing.set(false);
        this.load();
      },
      error: (err: unknown) => {
        this.undoing.set(false);
        this.undoError.set(
          apiErrorCode(err) === 'PendingDowngrade.NotFound'
            ? this.t().accOvPendingUndoGone
            : this.t().accOvPendingUndoError
        );
        this.load();
      },
    });
  }

  private date(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang(), { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
