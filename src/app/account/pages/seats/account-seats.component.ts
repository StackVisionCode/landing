import { HttpErrorResponse } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AccountSubscription,
  Seat,
  SeatQuote,
  TenantLimits,
} from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { nextPollDelayMs } from '@core/http/polling';
import { TranslationStore } from '@core/i18n/translation.store';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock } from '@core/http/throttling';
import { throttleNotice } from '@account/shared/account-throttle';
import { ConfirmDialogComponent } from '@account/shared/confirm-dialog.component';
import { PaymentProviderPickerComponent } from '@account/shared/payment-provider-picker.component';
import { AccountPaymentOption } from '@core/account/account-payment-options.service';
import {
  AccountSeatSlot,
  AccountSeatSlotReport,
  AccountSeatSlotService,
} from '@core/account/account-seat-slot.service';

/** Lo que pasó con el pago al volver del proveedor. */
type CheckoutOutcome = 'none' | 'paid' | 'done' | 'cancelled' | 'slow';

const SEAT_TYPE = 'Standard';
/**
 * Cuántas veces se pregunta por el desenlace antes de decir que está tardando. Con el backoff (1.5s → 15s)
 * esto cubre unos 4 minutos, que es lo que puede tardar la reconciliación cuando el webhook del proveedor
 * no llega: menos que eso anunciaba demora sobre una compra que estaba a punto de confirmarse.
 */
const MAX_POLLS = 20;

@Component({
  selector: 'app-account-seats',
  imports: [FormsModule, ConfirmDialogComponent, PaymentProviderPickerComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './account-seats.component.html',
})
export class AccountSeatsComponent {
  private readonly api = inject(AccountSubscriptionService);
  private readonly slotApi = inject(AccountSeatSlotService);
  private readonly session = inject(AccountSessionStore);
  private readonly i18n = inject(TranslationStore);
  private readonly route = inject(ActivatedRoute);

  readonly t = this.i18n.t;
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly subscription = signal<AccountSubscription | null>(null);
  readonly limits = signal<TenantLimits | null>(null);
  readonly seats = signal<Seat[]>([]);
  readonly slotReport = signal<AccountSeatSlotReport | null>(null);
  readonly slotReportFailed = signal(false);
  readonly gatedUsers = computed(
    () => this.slotReport()?.slots.filter((slot) => slot.isGated) ?? [],
  );
  readonly isShadowMode = computed(() => this.slotReport()?.mode === 'Shadow');

  readonly quantity = signal(1);
  readonly quote = signal<SeatQuote | null>(null);
  readonly quoting = signal(false);
  readonly buying = signal(false);
  readonly buyError = signal<string | null>(null);
  readonly cancelling = signal(false);
  /** Mensaje efímero de la cancelación: éxito / idempotente / error. */
  readonly cancelNotice = signal<{ kind: 'ok' | 'already' | 'error' } | null>(null);
  /** Un 429 bloquea el botón con la espera real del backend en vez de contarse como fallo. */
  protected readonly cooldown = new ActionCooldown();
  readonly waiting = this.cooldown.active;
  readonly waitLabel = computed(
    () => `${this.t().accWaitPrefix} ${formatClock(this.cooldown.secondsLeft())}`,
  );

  readonly outcome = signal<CheckoutOutcome>('none');

  readonly reorderOpen = signal(false);
  readonly reorderUser = signal<AccountSeatSlot | null>(null);
  readonly reorderTarget = signal(2);
  readonly reorderReason = signal('');
  readonly reorderSaving = signal(false);
  readonly reorderError = signal<string | null>(null);
  readonly reorderSuccess = signal<string | null>(null);
  /** Transient toast surfaced for errors that are not inline (403, 429). */
  readonly reorderToast = signal<string | null>(null);
  /** G-L1: slot overrides are a TenantAdmin action. The landing already restricts the whole
   * surface to the account admin, but hiding the trigger too keeps a non-admin viewer from
   * seeing an affordance the server would reject. */
  readonly canOverrideSlots = computed(() => this.session.isAccountAdmin());

  readonly openCheckout = computed(() => this.subscription()?.openSeatCheckout ?? null);

  /**
   * Lo que se ofrece pagar. Mientras se confirma un pago recién hecho la intención sigue abierta en el
   * backend, y mostrarla acá decía "termina el pago" sobre algo ya pagado — con un botón que devolvía al
   * checkout. Se oculta hasta saber el desenlace.
   */
  readonly pendingCheckout = computed(() =>
    this.outcome() === 'paid' || this.outcome() === 'slow' ? null : this.openCheckout(),
  );

  readonly usageLabel = computed(() => {
    const total = this.subscription()?.seats.total;
    if (total === undefined) {
      return '';
    }
    const used = this.limits()?.activeUsers;
    return used === undefined
      ? this.t().accOvSeatsTotal.replace('{total}', String(total))
      : this.t().accOvSeatsUsed.replace('{used}', String(used)).replace('{total}', String(total));
  });

  /** Presentational: stepper buttons, same effect as typing in the input. */
  step(delta: number): void {
    this.quantity.set(Math.min(500, Math.max(1, (Number(this.quantity()) || 1) + delta)));
    this.quote.set(null);
  }

  /** Presentational numbers for the metrics card. */
  readonly usedCount = computed(() => this.limits()?.activeUsers ?? 0);
  readonly totalCount = computed(() => this.subscription()?.seats.total ?? 0);
  readonly purchasedCount = computed(() => this.subscription()?.seats.purchased ?? 0);
  readonly usagePercent = computed(() =>
    this.totalCount() > 0
      ? Math.min(100, Math.round((this.usedCount() / this.totalCount()) * 100))
      : 0,
  );

  readonly breakdownLabel = computed(() => {
    const seats = this.subscription()?.seats;
    return seats
      ? this.t()
          .accOvSeatsBreakdown.replace('{included}', String(seats.includedInPlan))
          .replace('{purchased}', String(seats.purchased))
      : '';
  });

  /** Desglose por estado SOLO para seats Standard (empleados). Portal/Signature/ReadOnly/ServiceAccount
   * no se cuentan — son pools informativos y la política del producto es dejarlos fuera del dashboard
   * de consumo (ver feedback_portal_customer_seats_no_contar_sin_senior). */
  readonly standardStatusBreakdown = computed(() => {
    const breakdown = { active: 0, pastDue: 0, suspended: 0 };
    for (const seat of this.seats()) {
      if (seat.type !== SEAT_TYPE) continue;
      if (seat.status === 'Active') breakdown.active++;
      else if (seat.status === 'PastDue') breakdown.pastDue++;
      else if (seat.status === 'Suspended') breakdown.suspended++;
    }
    return breakdown;
  });

  readonly hasStandardAttention = computed(() => {
    const b = this.standardStatusBreakdown();
    return b.pastDue > 0 || b.suspended > 0;
  });

  constructor() {
    // El proveedor devuelve al usuario acá: ?checkout=success tras pagar, ?checkout=cancelled si se arrepintió.
    const returned = this.route.snapshot.queryParamMap.get('checkout');
    this.outcome.set(returned === 'cancelled' ? 'cancelled' : 'none');
    this.load(returned === 'success');
  }

  load(waitForPayment = false): void {
    this.loading.set(true);
    this.failed.set(false);
    this.slotReportFailed.set(false);
    forkJoin({
      subscription: this.api.get(),
      limits: this.api.limits().pipe(catchError(() => of(null))),
      seats: this.api.seats().pipe(catchError(() => of({ items: [], totalCount: 0 }))),
      slotReport: this.slotApi.getSlots().pipe(
        catchError(() => {
          this.slotReportFailed.set(true);
          return of(null);
        }),
      ),
    }).subscribe({
      next: ({ subscription, limits, seats, slotReport }) => {
        this.subscription.set(subscription);
        this.limits.set(limits);
        this.seats.set(seats.items);
        this.slotReport.set(slotReport);
        this.loading.set(false);
        if (waitForPayment) {
          this.followPayment(subscription.openSeatCheckout?.intentId ?? null);
        }
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  openReorder(slot: AccountSeatSlot): void {
    // G-L1 + G-B1: owners and non-admins must not even reach the modal.
    if (slot.isOwner || !this.canOverrideSlots()) return;
    this.reorderSuccess.set(null);
    this.reorderToast.set(null);
    this.reorderUser.set(slot);
    this.reorderTarget.set(slot.slotIndex);
    this.reorderReason.set('');
    this.reorderError.set(null);
    this.reorderOpen.set(true);
  }

  dismissReorder(): void {
    // G-L4: the spinner locks the modal so an in-flight PATCH cannot be duplicated by closing.
    if (this.reorderSaving()) return;
    this.reorderOpen.set(false);
    this.reorderUser.set(null);
    this.reorderError.set(null);
  }

  dismissReorderToast(): void {
    this.reorderToast.set(null);
  }

  saveReorder(): void {
    const reason = this.reorderReason().trim();
    if (reason.length < 3) {
      this.reorderError.set(this.t().accSeatsReorderInvalidReason);
      return;
    }
    this.submitOverride(this.resolvePriority());
  }

  /** "Send to end of queue": clears SlotPriorityAt and lets the backend park the user last. */
  sendToEnd(): void {
    const reason = this.reorderReason().trim();
    if (reason.length < 3) {
      this.reorderError.set(this.t().accSeatsReorderInvalidReason);
      return;
    }
    this.submitOverride(null);
  }

  private resolvePriority(): string | null | undefined {
    const user = this.reorderUser();
    const report = this.slotReport();
    if (!user || !report) return undefined;
    return this.priorityForTarget(report, user.userId, this.reorderTarget());
  }

  private submitOverride(priority: string | null | undefined): void {
    const user = this.reorderUser();
    const reason = this.reorderReason().trim();
    if (!user || this.reorderSaving()) return;
    if (priority === undefined) {
      this.reorderError.set(this.t().accSeatsReorderError);
      return;
    }

    this.reorderSaving.set(true);
    this.reorderError.set(null);
    this.slotApi
      .overrideSlotPriority(user.userId, { slotPriorityAt: priority, reason })
      .subscribe({
        next: () => {
          this.reorderSaving.set(false);
          this.reorderOpen.set(false);
          this.reorderUser.set(null);
          this.reorderSuccess.set(this.t().accSeatsReorderSuccess);
          this.refreshSlotReport();
        },
        error: (err: unknown) => {
          this.reorderSaving.set(false);
          this.handleOverrideError(err);
        },
      });
  }

  /** Map backend contract (SG-4) to inline vs. toast messaging per spec. */
  private handleOverrideError(err: unknown): void {
    const code = apiErrorCode(err);
    if (code === 'seats.slot_priority.invalid_reason') {
      this.reorderError.set(this.t().accSeatsReorderInvalidReason);
      return;
    }
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    if (status === 429) {
      this.reorderToast.set(this.t().accSeatsReorderRateLimited);
      return;
    }
    if (status === 403) {
      this.reorderToast.set(this.t().accSeatsReorderForbidden);
      return;
    }
    this.reorderError.set(this.t().accSeatsReorderError);
  }

  refreshSlotReport(): void {
    this.slotReportFailed.set(false);
    this.slotApi.getSlots().subscribe({
      next: (report) => this.slotReport.set(report),
      error: () => this.slotReportFailed.set(true),
    });
  }

  private priorityForTarget(
    report: AccountSeatSlotReport,
    userId: string,
    requestedSlot: number,
  ): string | null | undefined {
    const remaining = report.slots.filter((slot) => slot.userId !== userId);
    const minimum = remaining.some((slot) => slot.isOwner) ? 2 : 1;
    const target = Math.min(report.slots.length, Math.max(minimum, Math.trunc(requestedSlot)));
    const insertionIndex = target - 1;

    if (insertionIndex >= remaining.length) return null;

    const predecessor = remaining[insertionIndex - 1];
    if (!predecessor?.slotPriorityAt) return undefined;

    const predecessorMs = Date.parse(predecessor.slotPriorityAt);
    return Number.isFinite(predecessorMs) ? new Date(predecessorMs + 1).toISOString() : undefined;
  }

  /** Cotiza server-side: el total que se muestra es el mismo que se cobra. */
  getQuote(): void {
    this.quoting.set(true);
    this.buyError.set(null);
    this.api.seatQuote(SEAT_TYPE, this.quantity()).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.quoting.set(false);
      },
      error: (err: unknown) => {
        this.quoting.set(false);
        this.buyError.set(
          throttleNotice(err, this.cooldown, this.t()) ?? this.t().accSeatsBuyError,
        );
      },
    });
  }

  /** Picker: true cuando el user ya cotizó y pidió comprar, pendiente de elegir provider. */
  readonly pickerOpen = signal(false);

  buy(): void {
    if (!this.session.me()?.email) return;
    this.buyError.set(null);
    this.pickerOpen.set(true);
  }

  onProviderPickerDismissed(): void {
    this.pickerOpen.set(false);
  }

  onProviderPicked(option: AccountPaymentOption): void {
    const email = this.session.me()?.email;
    if (!email) {
      this.pickerOpen.set(false);
      return;
    }
    this.pickerOpen.set(false);
    this.buying.set(true);
    const back = `${window.location.origin}/account/seats`;
    this.api
      .startSeatCheckout({
        seatType: SEAT_TYPE,
        quantity: this.quantity(),
        autoRenew: true,
        payerEmail: email,
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
        provider: option.provider,
        method: option.method,
      })
      .subscribe({
        next: (checkout) => window.location.assign(checkout.checkoutUrl),
        error: (err) => {
          this.buying.set(false);
          // El backend rechaza abrir un segundo cobro mientras haya uno vivo; la pantalla ofrece retomarlo.
          this.buyError.set(
            throttleNotice(err, this.cooldown, this.t()) ??
              (apiErrorCode(err) === 'Seat.CheckoutInProgress'
                ? this.t().accSeatsInProgressError
                : this.t().accSeatsBuyError),
          );
          this.load();
        },
      });
  }

  readonly cancelConfirmOpen = signal(false);

  openCancelConfirm(): void {
    if (!this.openCheckout() || this.cancelling()) return;
    this.cancelConfirmOpen.set(true);
  }

  dismissCancelConfirm(): void {
    this.cancelConfirmOpen.set(false);
  }

  /** Cierra el intent pending: libera el guard y permite empezar una compra nueva. */
  cancelPending(): void {
    const pending = this.openCheckout();
    this.cancelConfirmOpen.set(false);
    if (!pending || this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.cancelNotice.set(null);
    this.api.cancelPendingSeatCheckout(pending.intentId).subscribe({
      next: (response) => {
        this.cancelling.set(false);
        this.cancelNotice.set({ kind: response.alreadyCancelled ? 'already' : 'ok' });
        this.load();
      },
      error: () => {
        this.cancelling.set(false);
        this.cancelNotice.set({ kind: 'error' });
      },
    });
  }

  /**
   * Tras pagar, los asientos los crea el webhook: se pollea el estado con espera creciente hasta que la
   * intención queda aprovisionada, y recién ahí se recargan los números.
   */
  private followPayment(intentId: string | null): void {
    if (!intentId) {
      // Ya no hay intención abierta: el webhook llegó antes que el usuario.
      this.outcome.set('done');
      return;
    }
    this.outcome.set('paid');
    const poll = (attempt: number): void => {
      if (attempt >= MAX_POLLS) {
        // El cobro está hecho; lo que falta es la confirmación. Decirlo es mejor que volver a "paga".
        this.outcome.set('slow');
        this.load();
        return;
      }
      setTimeout(
        () => {
          this.api.seatCheckoutStatus(intentId).subscribe({
            next: (status) => {
              if (status.status === 'Provisioned') {
                this.outcome.set('done');
                this.load();
                return;
              }
              poll(attempt + 1);
            },
            error: () => poll(attempt + 1),
          });
        },
        nextPollDelayMs(attempt, 1500, 15000),
      );
    };
    poll(0);
  }

  /** El armado de textos vive acá, no en la plantilla. */
  readonly pendingLabel = computed(() => {
    const pending = this.pendingCheckout();
    return pending
      ? this.t()
          .accSeatsPendingBody.replace('{quantity}', String(pending.quantity))
          .replace('{total}', this.money(pending.totalCents, pending.currency))
      : '';
  });

  readonly quoteTotalLabel = computed(() => {
    const priced = this.quote();
    return priced
      ? this.t().accSeatsQuoteTotal.replace(
          '{total}',
          this.money(priced.proratedTotalCents, priced.currency),
        )
      : '';
  });

  readonly quoteDetailLabel = computed(() => {
    const priced = this.quote();
    return priced
      ? this.t()
          .accSeatsQuoteProrated.replace('{date}', this.date(priced.currentPeriodEndUtc))
          .replace('{unit}', this.money(priced.unitAmountCents, priced.currency))
      : '';
  });

  seatRenewalLabel(seat: Seat): string {
    if (!seat.nextRenewalAtUtc) {
      return '';
    }
    const template = seat.autoRenew ? this.t().accSeatsRenews : this.t().accSeatsNoRenew;
    return template.replace('{date}', this.date(seat.nextRenewalAtUtc));
  }

  // -------- Reactivación de un seat Suspended/PastDue (B5) --------
  /** Picker de reactivación: distinto del `pickerOpen` de compra nueva — el user puede estar reactivando un
   * seat impago mientras tenga abierta la cotización para comprar más. Guarda el seat elegido para el handler. */
  readonly reactivationPickerOpen = signal(false);
  readonly reactivationError = signal<string | null>(null);
  /** Seat específico que el user tocó "Pay now". null mientras el picker esté cerrado. */
  private readonly pendingReactivationSeat = signal<Seat | null>(null);
  /** Mientras arrancamos el checkout de reactivación, deshabilitamos el botón de esa fila. */
  readonly reactivatingSeatId = signal<string | null>(null);

  canReactivate(seat: Seat): boolean {
    return seat.status === 'Suspended' || seat.status === 'PastDue';
  }

  startReactivation(seat: Seat): void {
    if (!this.canReactivate(seat) || this.reactivatingSeatId() !== null) return;
    if (!this.session.me()?.email) return;
    this.reactivationError.set(null);
    this.pendingReactivationSeat.set(seat);
    this.reactivationPickerOpen.set(true);
  }

  onReactivationPickerDismissed(): void {
    this.reactivationPickerOpen.set(false);
    this.pendingReactivationSeat.set(null);
  }

  onReactivationProviderPicked(option: AccountPaymentOption): void {
    const seat = this.pendingReactivationSeat();
    this.reactivationPickerOpen.set(false);
    this.pendingReactivationSeat.set(null);
    if (!seat) return;
    const email = this.session.me()?.email;
    if (!email) return;

    this.reactivatingSeatId.set(seat.id);
    const back = `${window.location.origin}/account/seats`;
    this.api
      .startSeatReactivationCheckout(seat.id, {
        payerEmail: email,
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
        provider: option.provider,
        method: option.method,
      })
      .subscribe({
        next: (checkout) => window.location.assign(checkout.checkoutUrl),
        error: (err: unknown) => {
          this.reactivatingSeatId.set(null);
          this.reactivationError.set(
            throttleNotice(err, this.cooldown, this.t()) ?? this.t().accSeatsReactivateError,
          );
        },
      });
  }

  money(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(
      cents / 100,
    );
  }

  date(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
