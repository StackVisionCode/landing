import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AccountAddOn, AccountSubscription } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { nextPollDelayMs } from '@core/http/polling';
import { TranslationStore } from '@core/i18n/translation.store';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock } from '@core/http/throttling';
import { throttleNotice } from '@account/shared/account-throttle';

/** Lo que pasó con el pago al volver del proveedor. */
type CheckoutOutcome = 'none' | 'paid' | 'done' | 'cancelled';

/** La intención en curso, para poder seguirla al volver del proveedor. */
const INTENT_KEY = 'tv-account-addon-intent';
/**
 * Cuántas veces se pregunta por el desenlace antes de decir que está tardando. Con el backoff (1.5s → 15s)
 * esto cubre unos 4 minutos, que es lo que puede tardar la reconciliación cuando el webhook del proveedor
 * no llega: menos que eso anunciaba demora sobre una compra que estaba a punto de confirmarse.
 */
const MAX_POLLS = 20;

@Component({
  selector: 'app-account-addons',
  templateUrl: './account-addons.component.html',
})
export class AccountAddOnsComponent {
  private readonly api = inject(AccountSubscriptionService);
  private readonly i18n = inject(TranslationStore);
  private readonly session = inject(AccountSessionStore);

  readonly t = this.i18n.t;
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly subscription = signal<AccountSubscription | null>(null);
  readonly buyingCode = signal<string | null>(null);
  readonly buyError = signal<string | null>(null);
  /** Un 429 bloquea el botón con la espera real del backend en vez de contarse como fallo. */
  protected readonly cooldown = new ActionCooldown();
  readonly waiting = this.cooldown.active;
  readonly waitLabel = computed(() => `${this.t().accWaitPrefix} ${formatClock(this.cooldown.secondsLeft())}`);

  readonly outcome = signal<CheckoutOutcome>('none');

  readonly included = computed(() => this.group('Included'));
  readonly active = computed(() => this.group('Active'));
  readonly available = computed(() => this.group('Available'));
  readonly isEmpty = computed(() => (this.subscription()?.addOns.length ?? 0) === 0);

  constructor() {
    const returned = inject(ActivatedRoute).snapshot.queryParamMap.get('checkout');
    const intentId = this.takeStoredIntent();
    this.outcome.set(returned === 'success' ? 'paid' : returned === 'cancelled' ? 'cancelled' : 'none');
    this.load();
    if (returned === 'success') {
      this.followPayment(intentId);
    }
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.get().subscribe({
      next: data => {
        this.subscription.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Solo se ofrece comprar lo que el backend considera disponible; el resto ni siquiera muestra botón. */
  buy(addOn: AccountAddOn): void {
    const email = this.session.me()?.email;
    if (addOn.eligibility !== 'Available' || !email) {
      return;
    }
    this.buyingCode.set(addOn.code);
    this.buyError.set(null);
    const back = `${window.location.origin}/account/add-ons`;
    this.api
      .startAddOnCheckout({
        addOnCode: addOn.code,
        quantity: 1,
        autoRenew: true,
        payerEmail: email,
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
      })
      .subscribe({
        next: checkout => {
          this.storeIntent(checkout.addOnPurchaseIntentId);
          window.location.assign(checkout.checkoutUrl);
        },
        error: err => {
          this.buyingCode.set(null);
          this.buyError.set(this.messageFor(err));
          this.load();
        },
      });
  }

  priceLabel(addOn: AccountAddOn): string {
    if (addOn.unitAmountCents === null) {
      return this.t().accAddOnNoPrice;
    }
    const price = this.money(addOn.unitAmountCents, addOn.currency ?? 'USD');
    const cycle = this.subscription()?.plan.billingCycle === 'Yearly' ? this.t().accAddOnPerYear : this.t().accAddOnPerMonth;
    return cycle.replace('{price}', price);
  }

  activeDetail(addOn: AccountAddOn): string {
    if (!addOn.currentPeriodEndUtc) {
      return '';
    }
    const template = addOn.autoRenew ? this.t().accOvAddOnRenews : this.t().accOvAddOnEndsOn;
    return template.replace('{date}', this.date(addOn.currentPeriodEndUtc));
  }

  /**
   * Tras pagar, el add-on lo crea el webhook: se pollea el estado con espera creciente hasta que la intención
   * queda activada, y recién ahí se recarga la pantalla.
   */
  private followPayment(intentId: string | null): void {
    if (!intentId) {
      // Sin intención guardada (otra pestaña, storage bloqueado): la recarga normal ya la muestra.
      this.outcome.set('done');
      return;
    }
    const poll = (attempt: number): void => {
      if (attempt >= MAX_POLLS) {
        return;
      }
      setTimeout(() => {
        this.api.addOnCheckoutStatus(intentId).subscribe({
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

  private storeIntent(intentId: string): void {
    try {
      sessionStorage.setItem(INTENT_KEY, intentId);
    } catch {
      // Sin storage se pierde el seguimiento, no la compra: el webhook activa igual.
    }
  }

  private takeStoredIntent(): string | null {
    try {
      const stored = sessionStorage.getItem(INTENT_KEY);
      sessionStorage.removeItem(INTENT_KEY);
      return stored;
    } catch {
      return null;
    }
  }

  /** El backend es quien decide; la pantalla solo traduce su negativa. */
  private messageFor(err: unknown): string {
    const t = this.t();
    const throttled = throttleNotice(err, this.cooldown, t);
    if (throttled) {
      return throttled;
    }
    switch (apiErrorCode(err)) {
      case 'AddOn.AlreadyIncludedInPlan':
        return t.accAddOnAlreadyIncluded;
      case 'AddOn.AlreadyActive':
        return t.accAddOnAlreadyActive;
      case 'AddOn.CheckoutInProgress':
        return t.accAddOnInProgressError;
      default:
        return t.accAddOnBuyError;
    }
  }

  private group(eligibility: AccountAddOn['eligibility']): AccountAddOn[] {
    return (this.subscription()?.addOns ?? []).filter(addOn => addOn.eligibility === eligibility);
  }

  private money(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang(), { style: 'currency', currency }).format(cents / 100);
  }

  private date(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang(), { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
