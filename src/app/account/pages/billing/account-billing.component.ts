import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SaaSPaymentRow, SubscriptionDiscount } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountPaymentOption } from '@core/account/account-payment-options.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { TranslationStore } from '@core/i18n/translation.store';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock } from '@core/http/throttling';
import { throttleNotice } from '@account/shared/account-throttle';
import { PaymentProviderPickerComponent } from '@account/shared/payment-provider-picker.component';
import { DuePaymentComponent } from './due-payment.component';

const PAGE_SIZE = 10;

/** Qué hacer cuando el user toca "Pay now" en una fila fallida — depende del `type` del pago. */
type PayNowKind = 'subscription-renewal' | 'seat' | 'addon' | 'other';

@Component({
  selector: 'app-account-billing',
  standalone: true,
  imports: [PaymentProviderPickerComponent, RouterLink, DuePaymentComponent],
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
  readonly loadingPage = signal(false);
  readonly page = signal(1);
  readonly rows = signal<SaaSPaymentRow[]>([]);
  readonly total = signal(0);
  readonly openingReceipt = signal<string | null>(null);
  readonly receiptError = signal<string | null>(null);
  /** Un 429 bloquea el botón con la espera real del backend en vez de contarse como fallo. */
  protected readonly cooldown = new ActionCooldown();
  readonly waiting = this.cooldown.active;
  readonly waitLabel = computed(() => `${this.t().accWaitPrefix} ${formatClock(this.cooldown.secondsLeft())}`);

  readonly isEmpty = computed(() => this.rows().length === 0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly hasPrevious = computed(() => this.page() > 1);
  readonly hasNext = computed(() => this.page() < this.totalPages());
  readonly pageLabel = computed(() =>
    this.t().accBillingPageOf.replace('{page}', String(this.page())).replace('{pages}', String(this.totalPages())),
  );
  /** "Showing 11–20 of 23": qué parte del historial se ve. */
  readonly rangeLabel = computed(() => {
    const from = (this.page() - 1) * PAGE_SIZE + 1;
    const to = Math.min(this.page() * PAGE_SIZE, this.total());
    return this.t()
      .accBillingRange.replace('{from}', String(from))
      .replace('{to}', String(to))
      .replace('{total}', String(this.total()));
  });

  /** La fila que disparó "Pay now" — alimenta el picker y arranca el checkout al confirmar provider.
   * Solo tiene sentido para pagos de tipo SubscriptionRenewal: para seat/addon fallidos linkeamos a
   * la pantalla de administración (no hay endpoint "renew this specific seat/addon" todavía). */
  private readonly pendingPayNow = signal<SaaSPaymentRow | null>(null);
  readonly pickerOpen = computed(() => this.pendingPayNow() !== null);
  readonly payingRowId = signal<string | null>(null);
  readonly payNowError = signal<string | null>(null);

  /** El descuento vigente de la suscripción y el canje de un código ("Have a code?"). */
  readonly discount = signal<SubscriptionDiscount | null>(null);
  readonly codeInput = signal('');
  readonly redeeming = signal(false);
  readonly redeemError = signal<string | null>(null);
  readonly redeemDone = signal(false);
  readonly discountLabel = computed(() => {
    const current = this.discount();
    return current ? this.describeDiscount(current) : this.t().accDiscountNone;
  });

  constructor() {
    this.load();
    this.api.discount().subscribe({
      next: current => this.discount.set(current ?? null),
      error: () => this.discount.set(null),
    });
  }

  /** Canjea el código: queda en la suscripción. El botón se bloquea mientras aplica (evita el doble canje). */
  redeem(): void {
    const code = this.codeInput().trim();
    if (!code || this.redeeming()) {
      return;
    }
    this.redeeming.set(true);
    this.redeemError.set(null);
    this.redeemDone.set(false);
    this.api.redeemDiscountCode(code).subscribe({
      next: applied => {
        this.discount.set(applied);
        this.codeInput.set('');
        this.redeeming.set(false);
        this.redeemDone.set(true);
      },
      error: (err: unknown) => {
        this.redeeming.set(false);
        this.redeemError.set(throttleNotice(err, this.cooldown, this.t()) ?? this.redeemErrorOf(apiErrorCode(err)));
      },
    });
  }

  /** "20% off · until Mar 15, 2027", "10% off · forever" o "$5.00 off your next payment". */
  private describeDiscount(current: SubscriptionDiscount): string {
    const label =
      current.percentBasisPoints != null
        ? `${current.percentBasisPoints / 100}%`
        : this.money(current.amountCents ?? 0, current.currency ?? 'USD');
    if (current.duration === 'Once') {
      return this.t().accDiscountOnce.replace('{label}', label);
    }
    if (current.duration === 'Forever' || !current.endsAtUtc) {
      return this.t().accDiscountForever.replace('{label}', label);
    }
    const date = new Date(current.endsAtUtc).toLocaleDateString(this.i18n.lang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return this.t().accDiscountUntil.replace('{label}', label).replace('{date}', date);
  }

  // Los errores de Growth (Codes.*) pasan tal cual por Subscription.
  private redeemErrorOf(code: string | null): string {
    if (code === 'Subscription.Discount.AlreadyActive') {
      return this.t().accDiscountAlreadyActive;
    }
    if (code?.endsWith('Expired')) {
      return this.t().accDiscountExpired;
    }
    if (code?.endsWith('LimitReached')) {
      return this.t().accDiscountUsed;
    }
    if (code?.startsWith('Codes.') || code === 'Subscription.DiscountCode.Required') {
      return this.t().accDiscountInvalid;
    }
    return this.t().accDiscountError;
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.payments(1, PAGE_SIZE).subscribe({
      next: page => {
        this.rows.set(page.items);
        this.total.set(page.totalCount);
        this.page.set(1);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Cambia de página: la nueva reemplaza a la que se ve. Fuera de rango no pide nada. */
  goToPage(target: number): void {
    if (this.loadingPage() || target < 1 || target > this.totalPages() || target === this.page()) {
      return;
    }
    this.loadingPage.set(true);
    this.api.payments(target, PAGE_SIZE).subscribe({
      next: page => {
        this.rows.set(page.items);
        this.total.set(page.totalCount);
        this.page.set(target);
        this.loadingPage.set(false);
      },
      error: () => this.loadingPage.set(false),
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

  /** "Promo code SPRI…0420 · 20% off (−$3.00)"; vacío sin descuento. */
  paymentDiscountOf(row: SaaSPaymentRow): string {
    if (!row.discountAmountCents || row.discountAmountCents <= 0) {
      return '';
    }
    return this.t()
      .accBillingDiscount.replace('{label}', row.discountLabel?.trim() || this.t().accBillingDiscountDefault)
      .replace('{amount}', this.money(row.discountAmountCents, row.currency));
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

  /** El botón solo aparece cuando el pago falló (incluye ChargedBack), hay flujo de recovery conocido
   * y el backend confirma que la fila sigue pagable — i.e. no hay un Succeeded posterior sobre el
   * mismo target que la haya saldado (si existe, "Pay now" sería un cobro doble). */
  canPayNow(row: SaaSPaymentRow): boolean {
    if (row.status !== 'Failed' && row.status !== 'ChargedBack') return false;
    const kind = this.payNowKind(row);
    if (kind === 'other') return false;
    // Asiento o add-on: "Pay now" lleva a "Pay what's due"; solo si ese mismo sigue vencido (no pagado ni quitado).
    if (kind === 'seat' || kind === 'addon') {
      return row.canRetry && !!row.targetId && (this.dueIds()?.has(row.targetId) ?? false);
    }
    return row.canRetry;
  }

  /** Lo vencido ahora, según "Pay what's due"; null mientras no se sabe (no se ofrece pagar asientos ni add-ons). */
  readonly dueIds = signal<ReadonlySet<string> | null>(null);

  /** Todo "Pay now" paga: el de asientos y add-ons lleva a "Pay what's due". */
  payNowLabel(_row: SaaSPaymentRow): string {
    return this.t().accBillingPayNow;
  }

  /** Asientos y add-ons se pagan en "Pay what's due", en esta misma página: no hay a dónde navegar. */
  payNowRouterLink(_row: SaaSPaymentRow): string[] | null {
    return null;
  }

  /** Click en Pay now para una renovación de suscripción fallida: abre el picker. El provider elegido
   * decide con qué método reintenta el cobro — no se asume Stripe. */
  startPayNow(row: SaaSPaymentRow): void {
    // Asiento o add-on vencido: se paga junto con lo demás en "Pay what's due".
    if (this.payNowKind(row) === 'seat' || this.payNowKind(row) === 'addon') {
      document.getElementById('due')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
