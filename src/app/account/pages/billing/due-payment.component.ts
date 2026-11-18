import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { DuePayment, DuePaymentItem } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountPaymentOption } from '@core/account/account-payment-options.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { ActionCooldown } from '@core/http/action-cooldown';
import { TranslationStore } from '@core/i18n/translation.store';
import { throttleNotice } from '@account/shared/account-throttle';
import { PaymentProviderPickerComponent } from '@account/shared/payment-provider-picker.component';

/**
 * "Pay what's due": todo lo vencido (plan, asientos y add-ons) en un solo pago y un solo recibo. Se puede
 * desmarcar asientos y add-ons; el plan vencido va siempre. Los asientos desmarcados se pueden quitar.
 */
@Component({
  selector: 'app-due-payment',
  imports: [PaymentProviderPickerComponent],
  templateUrl: './due-payment.component.html',
})
export class DuePaymentComponent implements OnInit {
  private readonly api = inject(AccountSubscriptionService);
  private readonly i18n = inject(TranslationStore);
  private readonly session = inject(AccountSessionStore);
  protected readonly cooldown = new ActionCooldown();

  readonly t = this.i18n.t;
  readonly due = signal<DuePayment | null>(null);
  private readonly unchecked = signal<ReadonlySet<string>>(new Set());
  readonly pickerOpen = signal(false);
  readonly paying = signal(false);
  readonly removing = signal(false);
  readonly confirmingRemove = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly items = computed(() => this.due()?.items ?? []);
  /** Lo que está vencido ahora (ids de plan, asientos y add-ons), para que el historial no ofrezca pagar otra cosa. */
  readonly dueIds = output<ReadonlySet<string>>();
  readonly totalCents = computed(() =>
    this.items()
      .filter(item => this.isChecked(item))
      .reduce((sum, item) => sum + item.amountCents, 0),
  );
  readonly uncheckedSeats = computed(() => this.items().filter(item => item.kind === 'Seat' && !this.isChecked(item)));
  readonly payLabel = computed(() => this.t().accDuePay.replace('{amount}', this.money(this.totalCents())));
  /** El total adeudado, para el botón final del picker ("Pay $X"). */
  readonly totalLabel = computed(() => this.money(this.totalCents()));
  readonly removeLabel = computed(() =>
    (this.confirmingRemove() ? this.t().accDueRemoveConfirm : this.t().accDueRemove).replace(
      '{count}',
      String(this.uncheckedSeats().length),
    ),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.due().subscribe({
      next: due => {
        this.due.set(due);
        this.unchecked.set(new Set());
        this.confirmingRemove.set(false);
        this.dueIds.emit(new Set(due.items.map(item => item.id)));
      },
      error: () => {
        this.due.set(null);
        this.dueIds.emit(new Set());
      },
    });
  }

  isRequired(item: DuePaymentItem): boolean {
    return item.kind === 'Plan';
  }

  isChecked(item: DuePaymentItem): boolean {
    return this.isRequired(item) || !this.unchecked().has(item.id);
  }

  toggle(item: DuePaymentItem): void {
    if (this.isRequired(item)) return;
    const next = new Set(this.unchecked());
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    this.unchecked.set(next);
    this.confirmingRemove.set(false);
  }

  amountOf(item: DuePaymentItem): string {
    return this.money(item.amountCents);
  }

  untilOf(item: DuePaymentItem): string {
    const date = new Date(item.periodEndUtc).toLocaleDateString(this.i18n.lang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return this.t().accDueUntil.replace('{date}', date);
  }

  pay(): void {
    if (this.totalCents() <= 0 || this.paying()) return;
    this.error.set(null);
    this.pickerOpen.set(true);
  }

  onProviderDismissed(): void {
    this.pickerOpen.set(false);
  }

  onProviderPicked(option: AccountPaymentOption): void {
    this.pickerOpen.set(false);
    if (!this.session.me()?.email) return;

    const checked = this.items().filter(item => this.isChecked(item));
    const back = `${window.location.origin}/account/billing`;
    this.paying.set(true);
    this.api
      .startRenewCheckout({
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
        provider: option.provider,
        method: option.method,
        seatIds: checked.filter(item => item.kind === 'Seat').map(item => item.id),
        addOnIds: checked.filter(item => item.kind === 'AddOn').map(item => item.id),
      })
      .subscribe({
        next: checkout => window.location.assign(checkout.checkoutUrl),
        error: (err: unknown) => {
          this.paying.set(false);
          this.error.set(
            throttleNotice(err, this.cooldown, this.t()) ??
              (apiErrorCode(err) === 'Subscription.Due.CheckoutOpen'
                ? this.t().accDueCheckoutOpen
                : this.t().accDueError),
          );
        },
      });
  }

  /** Dos pasos: el primer clic pide confirmar; el segundo quita los asientos desmarcados. */
  removeUnchecked(): void {
    const seats = this.uncheckedSeats();
    if (seats.length === 0 || this.removing()) return;
    if (!this.confirmingRemove()) {
      this.confirmingRemove.set(true);
      return;
    }

    this.removing.set(true);
    this.api.removeUnusedSeats(seats.map(seat => seat.id)).subscribe({
      next: result => {
        this.removing.set(false);
        this.notice.set(this.t().accDueRemoved.replace('{count}', String(result.removed)));
        this.load();
      },
      error: (err: unknown) => {
        this.removing.set(false);
        this.confirmingRemove.set(false);
        this.error.set(throttleNotice(err, this.cooldown, this.t()) ?? this.t().accDueError);
      },
    });
  }

  private money(cents: number): string {
    const currency = this.due()?.currency ?? 'USD';
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(cents / 100);
  }
}
