import { Component, computed, inject, signal } from '@angular/core';
import { SaaSPaymentRow } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { apiErrorCode } from '@core/http/api-error';
import { TranslationStore } from '@core/i18n/translation.store';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock } from '@core/http/throttling';
import { throttleNotice } from '@account/shared/account-throttle';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-account-billing',
  templateUrl: './account-billing.component.html',
})
export class AccountBillingComponent {
  private readonly api = inject(AccountSubscriptionService);
  private readonly i18n = inject(TranslationStore);

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

  /** Verde solo lo cobrado; rojo lo que falló; gris el resto, que todavía no es nada. */
  statusTone(row: SaaSPaymentRow): string {
    if (row.status === 'Succeeded') {
      return 'bg-emerald-50 text-emerald-700';
    }
    return row.status === 'Failed' || row.status === 'ChargedBack'
      ? 'bg-red-50 text-red-700'
      : 'bg-gray-100 text-gray-600';
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

  private money(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(cents / 100);
  }
}
