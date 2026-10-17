import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SaaSPaymentRow } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountPaymentOption } from '@core/account/account-payment-options.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { TranslationStore } from '@core/i18n/translation.store';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock } from '@core/http/throttling';
import { throttleNotice } from '@account/shared/account-throttle';
import { PaymentProviderPickerComponent } from '@account/shared/payment-provider-picker.component';

const PAGE_SIZE = 25;

/** Qué hacer cuando el user toca "Pay now" en una fila fallida — depende del `type` del pago. */
type PayNowKind = 'subscription-renewal' | 'seat' | 'addon' | 'other';

@Component({
  selector: 'app-account-billing',
  standalone: true,
  imports: [PaymentProviderPickerComponent, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './account-billing.component.html',
})
export class AccountBillingComponent {
  private readonly api = inject(AccountSubscriptionService);
  private readonly i18n = inject(TranslationStore);
  private readonly session = inject(AccountSessionStore);
  private readonly router = inject(Router);

  readonly t = this.i18n.t;
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly loadingMore = signal(false);
  readonly rows = signal<SaaSPaymentRow[]>([]);
  readonly total = signal(0);
  readonly openingReceipt = signal<string | null>(null);
  readonly receiptError = signal<string | null>(null);
  /** Un 429 bloquea el botón con la espera real del backend en vez de contarse como fallo. */
  protected readonly cooldown = new ActionCooldown();
  readonly waiting = this.cooldown.active;
  readonly waitLabel = computed(() => `${this.t().accWaitPrefix} ${formatClock(this.cooldown.secondsLeft())}`);

  readonly isEmpty = computed(() => this.rows().length === 0);
  readonly hasMore = computed(() => this.rows().length < this.total());

  /** La fila que disparó "Pay now" — alimenta el picker y arranca el checkout al confirmar provider.
   * Solo tiene sentido para pagos de tipo SubscriptionRenewal: para seat/addon fallidos linkeamos a
   * la pantalla de administración (no hay endpoint "renew this specific seat/addon" todavía). */
  private readonly pendingPayNow = signal<SaaSPaymentRow | null>(null);
  readonly pickerOpen = computed(() => this.pendingPayNow() !== null);
  readonly payingRowId = signal<string | null>(null);
  readonly payNowError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.payments(1, PAGE_SIZE).subscribe({
      next: page => {
        this.rows.set(page.items);
        this.total.set(page.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Página siguiente: se suma a lo que ya se ve, no lo reemplaza. */
  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }
    this.loadingMore.set(true);
    const next = Math.floor(this.rows().length / PAGE_SIZE) + 1;
    this.api.payments(next, PAGE_SIZE).subscribe({
      next: page => {
        this.rows.update(current => [...current, ...page.items]);
        this.total.set(page.totalCount);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  /**
   * El PDF no se sirve desde el navegador: el backend valida que el pago es de este tenant y devuelve una
   * URL firmada de vida corta, que es la que se abre.
   */
  openReceipt(row: SaaSPaymentRow): void {
    if (!row.hasReceipt || this.openingReceipt() !== null) {
      return;
    }
    this.openingReceipt.set(row.id);
    this.receiptError.set(null);
    this.api.receiptUrl(row.id).subscribe({
      next: receipt => {
        this.openingReceipt.set(null);
        window.open(receipt.downloadUrl, '_blank', 'noopener');
      },
      error: (err: unknown) => {
        this.openingReceipt.set(null);
        this.receiptError.set(
          throttleNotice(err, this.cooldown, this.t()) ??
            (apiErrorCode(err) === 'Receipt.NotReady' || apiErrorCode(err) === 'Receipt.Download.NotReady'
              ? this.t().accBillingReceiptNotReady
              : this.t().accBillingReceiptError)
        );
      },
    });
  }

  /** El tipo que manda el backend, en palabras del usuario. Si aparece uno nuevo, se muestra tal cual. */
  descriptionOf(row: SaaSPaymentRow): string {
    const labels = this.t() as unknown as Record<string, string | undefined>;
    return labels[`accBillingType${row.type}`] ?? row.type;
  }

  statusOf(row: SaaSPaymentRow): string {
    const labels = this.t() as unknown as Record<string, string | undefined>;
    return labels[`accBillingStatus${row.status}`] ?? row.status;
  }

  /** Azure solo lo cobrado; sand con borde lo que falló; outline el resto, que todavía no es nada. */
  statusTone(row: SaaSPaymentRow): string {
    if (row.status === 'Succeeded') {
      return 'bg-azure/20 text-twilight';
    }
    return row.status === 'Failed' || row.status === 'ChargedBack'
      ? 'bg-sand text-twilight border border-twilight/40'
      : 'border border-line text-muted';
  }

  refundLabel(row: SaaSPaymentRow): string {
    return row.refundedAmountCents > 0
      ? this.t().accBillingRefunded.replace('{amount}', this.money(row.refundedAmountCents, row.currency))
      : '';
  }

  amountOf(row: SaaSPaymentRow): string {
    return this.money(row.amountCents, row.currency);
  }

  dateOf(row: SaaSPaymentRow): string {
    return new Date(row.paidAtUtc ?? row.createdAtUtc).toLocaleDateString(this.i18n.lang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Clasifica el pago en un flujo de recovery: subscription-renewal abre picker; seat/addon enlazan a su
   * página de administración (donde el picker vive); otros no muestran acción. */
  payNowKind(row: SaaSPaymentRow): PayNowKind {
    if (row.type === 'SubscriptionRenewal') return 'subscription-renewal';
    if (row.type === 'SeatRenewal' || row.type === 'SeatsPurchaseCharge') return 'seat';
    if (row.type === 'AddOnRenewal' || row.type === 'AddOnPurchaseCharge') return 'addon';
    return 'other';
  }

  /** El botón solo aparece cuando el pago falló (incluye ChargedBack) y hay flujo de recovery conocido. */
  canPayNow(row: SaaSPaymentRow): boolean {
    if (row.status !== 'Failed' && row.status !== 'ChargedBack') return false;
    return this.payNowKind(row) !== 'other';
  }

  payNowLabel(row: SaaSPaymentRow): string {
    switch (this.payNowKind(row)) {
      case 'seat':
        return this.t().accBillingPayNowSeat;
      case 'addon':
        return this.t().accBillingPayNowAddOn;
      default:
        return this.t().accBillingPayNow;
    }
  }

  /** Para seat/addon devuelve el routerLink target; para subscription-renewal el botón abre el picker en lugar de navegar. */
  payNowRouterLink(row: SaaSPaymentRow): string[] | null {
    switch (this.payNowKind(row)) {
      case 'seat':
        return ['/account/seats'];
      case 'addon':
        return ['/account/addons'];
      default:
        return null;
    }
  }

  /** Click en Pay now para una renovación de suscripción fallida: abre el picker. El provider elegido
   * decide con qué método reintenta el cobro — no se asume Stripe. */
  startPayNow(row: SaaSPaymentRow): void {
    if (this.payNowKind(row) !== 'subscription-renewal') return;
    if (this.payingRowId() !== null) return;
    this.payNowError.set(null);
    this.pendingPayNow.set(row);
  }

  onProviderPickerDismissed(): void {
    this.pendingPayNow.set(null);
  }

  onProviderPicked(option: AccountPaymentOption): void {
    const row = this.pendingPayNow();
    this.pendingPayNow.set(null);
    if (!row) return;
    const email = this.session.me()?.email;
    if (!email) return;

    this.payingRowId.set(row.id);
    const back = `${window.location.origin}/account/billing`;
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
          this.payingRowId.set(null);
          this.payNowError.set(throttleNotice(err, this.cooldown, this.t()) ?? this.t().accBillingPayNowError);
        },
      });
  }

  private money(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(cents / 100);
  }
}
