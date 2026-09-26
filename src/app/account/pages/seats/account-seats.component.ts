import { Component, computed, inject, signal } from '@angular/core';
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
  imports: [FormsModule],
  templateUrl: './account-seats.component.html',
})
export class AccountSeatsComponent {
  private readonly api = inject(AccountSubscriptionService);
  private readonly session = inject(AccountSessionStore);
  private readonly i18n = inject(TranslationStore);
  private readonly route = inject(ActivatedRoute);

  readonly t = this.i18n.t;
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly subscription = signal<AccountSubscription | null>(null);
  readonly limits = signal<TenantLimits | null>(null);
  readonly seats = signal<Seat[]>([]);

  readonly quantity = signal(1);
  readonly quote = signal<SeatQuote | null>(null);
  readonly quoting = signal(false);
  readonly buying = signal(false);
  readonly buyError = signal<string | null>(null);
  /** Un 429 bloquea el botón con la espera real del backend en vez de contarse como fallo. */
  protected readonly cooldown = new ActionCooldown();
  readonly waiting = this.cooldown.active;
  readonly waitLabel = computed(() => `${this.t().accWaitPrefix} ${formatClock(this.cooldown.secondsLeft())}`);

  readonly outcome = signal<CheckoutOutcome>('none');

  readonly openCheckout = computed(() => this.subscription()?.openSeatCheckout ?? null);

  /**
   * Lo que se ofrece pagar. Mientras se confirma un pago recién hecho la intención sigue abierta en el
   * backend, y mostrarla acá decía "termina el pago" sobre algo ya pagado — con un botón que devolvía al
   * checkout. Se oculta hasta saber el desenlace.
   */
  readonly pendingCheckout = computed(() =>
    this.outcome() === 'paid' || this.outcome() === 'slow' ? null : this.openCheckout()
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

  readonly breakdownLabel = computed(() => {
    const seats = this.subscription()?.seats;
    return seats
      ? this.t()
          .accOvSeatsBreakdown.replace('{included}', String(seats.includedInPlan))
          .replace('{purchased}', String(seats.purchased))
      : '';
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
    forkJoin({
      subscription: this.api.get(),
      limits: this.api.limits().pipe(catchError(() => of(null))),
      seats: this.api.seats().pipe(catchError(() => of({ items: [], totalCount: 0 }))),
    }).subscribe({
      next: ({ subscription, limits, seats }) => {
        this.subscription.set(subscription);
        this.limits.set(limits);
        this.seats.set(seats.items);
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

  /** Cotiza server-side: el total que se muestra es el mismo que se cobra. */
  getQuote(): void {
    this.quoting.set(true);
    this.buyError.set(null);
    this.api.seatQuote(SEAT_TYPE, this.quantity()).subscribe({
      next: quote => {
        this.quote.set(quote);
        this.quoting.set(false);
      },
      error: (err: unknown) => {
        this.quoting.set(false);
        this.buyError.set(throttleNotice(err, this.cooldown, this.t()) ?? this.t().accSeatsBuyError);
      },
    });
  }

  buy(): void {
    const email = this.session.me()?.email;
    if (!email) {
      return;
    }
    this.buying.set(true);
    this.buyError.set(null);
    const back = `${window.location.origin}/account/seats`;
    this.api
      .startSeatCheckout({
        seatType: SEAT_TYPE,
        quantity: this.quantity(),
        autoRenew: true,
        payerEmail: email,
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
      })
      .subscribe({
        next: checkout => window.location.assign(checkout.checkoutUrl),
        error: err => {
          this.buying.set(false);
          // El backend rechaza abrir un segundo cobro mientras haya uno vivo; la pantalla ofrece retomarlo.
          this.buyError.set(
            throttleNotice(err, this.cooldown, this.t()) ??
              (apiErrorCode(err) === 'Seat.CheckoutInProgress'
                ? this.t().accSeatsInProgressError
                : this.t().accSeatsBuyError)
          );
          this.load();
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
      setTimeout(() => {
        this.api.seatCheckoutStatus(intentId).subscribe({
          next: status => {
            if (status.status === 'Provisioned') {
              this.outcome.set('done');
              this.load();
              return;
            }
            poll(attempt + 1);
          },
          error: () => poll(attempt + 1),
        });
      }, nextPollDelayMs(attempt, 1500, 15000));
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
      ? this.t().accSeatsQuoteTotal.replace('{total}', this.money(priced.proratedTotalCents, priced.currency))
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

  seatStatusLabel(seat: Seat): string {
    return seat.currentUserId ? this.t().accSeatsAssigned : this.t().accSeatsFree;
  }

  seatRenewalLabel(seat: Seat): string {
    if (!seat.nextRenewalAtUtc) {
      return '';
    }
    const template = seat.autoRenew ? this.t().accSeatsRenews : this.t().accSeatsNoRenew;
    return template.replace('{date}', this.date(seat.nextRenewalAtUtc));
  }

  money(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(cents / 100);
  }

  date(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang(), { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
