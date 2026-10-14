import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AccountAddOn, AccountOpenAddOnCheckout, AccountSubscription } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { nextPollDelayMs } from '@core/http/polling';
import { moduleLabel } from '@core/plans/module-labels';
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
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
  /** Intent del last checkout abierto: lo seteamos al redirigir, lo leemos al volver, y queda para cancelar
   * si el usuario abandonó la pasarela y vuelve con `?checkout=cancelled` o reintenta otra compra. Es el
   * fallback para cuando el snapshot del backend aún no trae el array (o lo trae vacío por un desalineo). */
  readonly pendingIntentId = signal<string | null>(null);
  /** Qué intent está siendo cancelado: con varias tarjetas en pantalla no basta un booleano global. */
  readonly cancellingId = signal<string | null>(null);
  readonly cancelNotice = signal<{ kind: 'ok' | 'already' | 'error' } | null>(null);

  readonly included = computed(() => this.group('Included'));
  readonly active = computed(() => this.group('Active'));
  readonly available = computed(() => this.group('Available'));
  readonly isEmpty = computed(() => (this.subscription()?.addOns.length ?? 0) === 0);

  /**
   * Decisión UX: pintamos UNA tarjeta por intent abierto. Add-ons permite varios en paralelo (uno por
   * `addOnCode`): si colapsásemos a la primera, el usuario no vería ni podría cerrar las otras compras
   * abandonadas. El snapshot del backend es la fuente de verdad; el `pendingIntentId` del sessionStorage
   * solo entra en juego si el snapshot aún no trae el campo (compat con un backend viejo) o lo manda vacío
   * tras el error `AddOn.CheckoutInProgress` del flow de compra.
   */
  readonly openCheckouts = computed<AccountOpenAddOnCheckout[]>(() => {
    const fromSnapshot = this.subscription()?.openAddOnCheckouts;
    if (fromSnapshot && fromSnapshot.length > 0) {
      return fromSnapshot;
    }
    const legacy = this.pendingIntentId();
    return legacy
      ? [
          // Fallback: el intent del sessionStorage no sabemos su addOnCode ni URL, pero sí basta para
          // dibujar un card con botón Cancel. Resume se oculta cuando no hay URL.
          {
            intentId: legacy,
            addOnCode: '',
            addOnDisplayName: '',
            quantity: 0,
            totalCents: 0,
            currency: '',
            checkoutUrl: '',
            expiresAtUtc: '',
          },
        ]
      : [];
  });

  constructor() {
    const returned = inject(ActivatedRoute).snapshot.queryParamMap.get('checkout');
    const intentId = this.takeStoredIntent();
    this.outcome.set(returned === 'success' ? 'paid' : returned === 'cancelled' ? 'cancelled' : 'none');
    // Al volver con checkout cancelado, el intent sigue Pending en el backend: ofrecer cerrarlo.
    if (returned === 'cancelled' && intentId) {
      this.pendingIntentId.set(intentId);
    }
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
          // Si el backend rechaza por intent abierto, el que tenemos en storage sirve para cancelar.
          if (apiErrorCode(err) === 'AddOn.CheckoutInProgress') {
            const stored = this.takeStoredIntent();
            if (stored) {
              this.pendingIntentId.set(stored);
            }
          }
          this.load();
        },
      });
  }

  /** Cierra el intent pending del snapshot (o el del storage, cuando el snapshot aún no lo trae). */
  cancelPending(intentId: string): void {
    if (!intentId || this.cancellingId() !== null) {
      return;
    }
    if (!window.confirm(this.t().accAddOnsCancelConfirm)) {
      return;
    }
    this.cancellingId.set(intentId);
    this.cancelNotice.set(null);
    this.api.cancelPendingAddOnCheckout(intentId).subscribe({
      next: response => {
        this.cancellingId.set(null);
        this.cancelNotice.set({ kind: response.alreadyCancelled ? 'already' : 'ok' });
        if (this.pendingIntentId() === intentId) {
          this.pendingIntentId.set(null);
        }
        this.load();
      },
      error: () => {
        this.cancellingId.set(null);
        this.cancelNotice.set({ kind: 'error' });
      },
    });
  }

  /** Pasa al proveedor para terminar de pagar un intent todavía abierto. */
  resumeCheckout(checkout: AccountOpenAddOnCheckout): void {
    if (!checkout.checkoutUrl) {
      return;
    }
    this.storeIntent(checkout.intentId);
    window.location.assign(checkout.checkoutUrl);
  }

  /**
   * El nombre que se MUESTRA. Sale del mismo diccionario que la pantalla de Plan (`MODULE_LABELS`,
   * con es/en) y no de `addOn.name`, que vive en la base y solo existe en español — por eso el mismo
   * módulo aparecía como "Correo" aquí y como "Integrated email" allá.
   *
   * `addOn.name` queda como respaldo para un add-on que no aporte módulos (p. ej. uno de solo cupos).
   */
  displayName(addOn: AccountAddOn): string {
    const [module] = addOn.modules ?? [];
    return module ? moduleLabel(module, this.i18n.lang()) : addOn.name;
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
