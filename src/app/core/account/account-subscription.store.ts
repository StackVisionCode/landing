import { Injectable, computed, inject, signal } from '@angular/core';
import { AccountSubscription } from './account-subscription.models';
import { AccountSubscriptionService } from './account-subscription.service';
import { BillingPreference, BillingPreferenceService } from './billing-preference.service';

/**
 * Snapshot compartido de la suscripción del Account. Lo precarga el shell para alimentar banners globales
 * (próxima renovación, acceso cortado) y la lo reutilizan las sub-páginas que ya cargan `/me/account` por su
 * cuenta. Las sub-páginas pueden pedir un refresh tras una acción.
 */
@Injectable({ providedIn: 'root' })
export class AccountSubscriptionStore {
  private readonly api = inject(AccountSubscriptionService);
  private readonly preferenceApi = inject(BillingPreferenceService);

  private readonly _summary = signal<AccountSubscription | null>(null);
  private readonly _loading = signal(false);
  private readonly _preference = signal<BillingPreference | null>(null);

  readonly summary = this._summary.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly preference = this._preference.asReadonly();

  readonly billingAccessBlocked = computed(() => this._summary()?.plan.billingAccessBlocked === true);
  readonly cancelAtPeriodEnd = computed(() => this._summary()?.period.cancelAtPeriodEnd === true);

  /** Días hasta la próxima renovación (o fin de período si no hay nextRenewal). Nulo si no aplica. */
  readonly daysUntilRenewal = computed<number | null>(() => {
    const s = this._summary();
    if (!s) return null;
    const period = s.period;
    const target = period.nextRenewalAtUtc ?? period.currentPeriodEndUtc;
    if (!target) return null;
    const diff = new Date(target).getTime() - Date.now();
    return Number.isNaN(diff) ? null : Math.ceil(diff / 86_400_000);
  });

  /** Carga el snapshot (idempotente, silenciosa). */
  load(): void {
    if (this._loading()) return;
    this._loading.set(true);
    this.api.get().subscribe({
      next: s => {
        this._summary.set(s);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
    // La preferencia va aparte para no bloquear el banner si falla.
    this.preferenceApi.get().subscribe({
      next: p => this._preference.set(p),
      error: () => {
        /* silencioso: el banner cae al copy neutro. */
      },
    });
  }

  /** Lo llaman las sub-páginas tras cambios que afectan el snapshot. */
  refresh(): void {
    this.load();
  }
}
