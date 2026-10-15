import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountSubscriptionStore } from '@core/account/account-subscription.store';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';

type BannerTone = 'info' | 'warning' | 'critical';

/**
 * Banner global del Account. Dos modos:
 *  - Pre-vencimiento (sub Active con ≤7 días al fin del período): solo informa, sin botón, porque el
 *    renew-checkout del backend rechaza estados Active y hoy no existe prepago del próximo ciclo.
 *  - Lapso (billingAccessBlocked): botón "Pay now" que arranca el checkout, único camino para
 *    recuperar el acceso.
 */
@Component({
  selector: 'app-account-expiry-banner',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (visible()) {
      <div
        class="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-[13px] sm:mx-6"
        [class.border-sky-200]="tone() === 'info'"
        [class.bg-sky-50]="tone() === 'info'"
        [class.text-sky-900]="tone() === 'info'"
        [class.border-amber-200]="tone() === 'warning'"
        [class.bg-amber-50]="tone() === 'warning'"
        [class.text-amber-900]="tone() === 'warning'"
        [class.border-red-200]="tone() === 'critical'"
        [class.bg-red-50]="tone() === 'critical'"
        [class.text-red-900]="tone() === 'critical'"
        role="alert"
      >
        <ion-icon [name]="icon()" class="shrink-0 text-lg" aria-hidden="true"></ion-icon>
        <div class="min-w-0 flex-1">
          <p class="font-semibold">{{ title() }}</p>
          <p class="opacity-90">{{ message() }}</p>
        </div>
        @if (showPayButton()) {
          <button
            type="button"
            class="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
            [class.bg-sky-700]="tone() === 'info'"
            [class.hover:bg-sky-800]="tone() === 'info'"
            [class.bg-amber-700]="tone() === 'warning'"
            [class.hover:bg-amber-800]="tone() === 'warning'"
            [class.bg-red-700]="tone() === 'critical'"
            [class.hover:bg-red-800]="tone() === 'critical'"
            [disabled]="working()"
            (click)="payNow()"
          >
            {{ working() ? 'Opening…' : buttonLabel() }}
          </button>
        }
      </div>
    }
  `,
})
export class AccountExpiryBannerComponent {
  private readonly store = inject(AccountSubscriptionStore);
  private readonly api = inject(AccountSubscriptionService);
  private readonly session = inject(AccountSessionStore);
  private readonly router = inject(Router);

  readonly working = signal(false);

  readonly tone = computed<BannerTone>(() => {
    if (this.store.billingAccessBlocked()) return 'critical';
    const d = this.store.daysUntilRenewal();
    if (d === null) return 'info';
    if (d <= 1) return 'critical';
    if (d <= 3) return 'warning';
    return 'info';
  });

  readonly visible = computed(() => {
    if (this.store.billingAccessBlocked()) return true;
    if (this.store.cancelAtPeriodEnd()) return false;
    const d = this.store.daysUntilRenewal();
    return d !== null && d >= 0 && d <= 7;
  });

  /** Pay now funciona tanto en lapso (recupera acceso) como en pre-vencimiento (prepaga el próximo ciclo). */
  readonly showPayButton = computed(() => this.visible());

  readonly icon = computed(() => {
    const t = this.tone();
    if (t === 'critical') return 'alert-circle-outline';
    if (t === 'warning') return 'time-outline';
    return 'calendar-outline';
  });

  readonly title = computed(() => {
    if (this.store.billingAccessBlocked()) return 'Your access is paused';
    const d = this.store.daysUntilRenewal();
    if (d === null) return 'Subscription';
    if (d <= 0) return 'Your billing period ends today';
    if (d === 1) return 'Your billing period ends tomorrow';
    return `Your billing period ends in ${d} days`;
  });

  /** Variante por preferencia; 'loading' mantiene el copy neutro mientras no responde. */
  readonly preferenceVariant = computed<'auto-with-pm' | 'auto-no-pm' | 'manual' | 'loading'>(() => {
    const pref = this.store.preference();
    if (!pref) return 'loading';
    if (pref.mode === 'Manual') return 'manual';
    return pref.defaultPaymentMethod ? 'auto-with-pm' : 'auto-no-pm';
  });

  readonly message = computed(() => {
    if (this.store.billingAccessBlocked())
      return 'The last payment did not go through. Pay now to restore access for your team.';
    const d = this.store.daysUntilRenewal();
    const periodEnd = this.store.summary()?.period.currentPeriodEndUtc;
    const when = periodEnd ? new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
    const pref = this.store.preference();
    const pm = pref?.defaultPaymentMethod;
    switch (this.preferenceVariant()) {
      case 'auto-with-pm':
        return when && pm
          ? `We'll charge your ${pm.brand} ending in ${pm.last4} on ${when}.`
          : "Your subscription will renew automatically. We'll email you a receipt.";
      case 'auto-no-pm':
        return when
          ? `Your subscription will try to charge automatically on ${when} but we don't have a saved card.`
          : "Your subscription is set to renew automatically but we don't have a saved card yet.";
      case 'manual':
        return when
          ? `Your subscription period ends on ${when}. Pay now to renew, or wait — we'll remind you again.`
          : "Pay now to renew, or wait — we'll remind you again at the end.";
      case 'loading':
      default:
        return "Pay now to settle the next charge early, or wait — we'll remind you again when the period closes.";
    }
  });

  readonly buttonLabel = computed(() => {
    if (this.store.billingAccessBlocked()) return 'Pay now';
    switch (this.preferenceVariant()) {
      case 'auto-with-pm':
        return 'Manage billing';
      case 'auto-no-pm':
        return 'Add card';
      default:
        return 'Pay now';
    }
  });

  payNow(): void {
    // En Automatic con PM el botón "Manage billing" no cobra: lleva al plan a gestionar.
    // Lo mismo "Add card": por ahora reusa la misma ruta y el flujo de guardar tarjeta vive allí.
    if (!this.store.billingAccessBlocked() && this.preferenceVariant() === 'auto-with-pm') {
      void this.router.navigate(['/account/plan']);
      return;
    }
    const email = this.session.me()?.email;
    if (this.working() || !email) return;
    this.working.set(true);
    const back = `${window.location.origin}/account/plan`;
    this.api
      .startRenewCheckout({
        payerEmail: email,
        successUrl: `${back}?checkout=success`,
        cancelUrl: `${back}?checkout=cancelled`,
      })
      .subscribe({
        next: checkout => window.location.assign(checkout.checkoutUrl),
        error: () => {
          this.working.set(false);
          void this.router.navigate(['/account/plan']);
        },
      });
  }
}
