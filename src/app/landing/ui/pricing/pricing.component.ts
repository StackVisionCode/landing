import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PlanCatalogStore } from '@core/plans/plan-catalog.store';
import { annualSavings, formatUsd, maxAnnualSavingsPercent, storageLabel } from '@core/plans/plan-pricing';
import { moduleLabel } from '@core/plans/module-labels';
import type { PlanResponse } from '@core/plans/plans.models';

/**
 * Precios reales de GET /plans (Subscription.Api). Cuántos planes hay, su orden y cuál se destaca
 * vienen del backend: la grilla se adapta a 1, 2 o 3+ planes y nada depende del código del plan.
 */
@Component({
  selector: 'app-pricing',
  imports: [RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './pricing.component.html',
})
export class PricingComponent {
  private readonly catalog = inject(PlanCatalogStore);
  private readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.c;
  protected readonly lang = this.translation.lang;
  protected readonly isAnnual = signal(false);

  protected readonly plans = this.catalog.plans;
  protected readonly isLoading = this.catalog.isLoading;
  protected readonly hasError = this.catalog.hasError;

  protected readonly several = computed(() => this.plans().length > 1);
  protected readonly maxSavings = computed(() => maxAnnualSavingsPercent(this.plans()));

  /** Una tarjeta centrada y más ancha; dos columnas; tres o más. */
  protected readonly gridClass = computed(() => {
    const count = this.plans().length;
    if (count <= 1) return 'mx-auto max-w-md grid-cols-1';
    if (count === 2) return 'mx-auto max-w-4xl grid-cols-1 md:grid-cols-2';
    return 'grid-cols-1 lg:grid-cols-3';
  });

  constructor() {
    this.catalog.load();
  }

  retryLoadPlans(): void {
    this.catalog.load(true);
  }

  priceFor(plan: PlanResponse): number {
    const cycle = this.isAnnual() ? 'Yearly' : 'Monthly';
    return plan.pricesUsdByCycle[cycle] ?? plan.monthlyPriceUsd;
  }

  isHighlighted(plan: PlanResponse): boolean {
    return plan.isFeatured;
  }

  savingsFor(plan: PlanResponse): string | null {
    const savings = annualSavings(plan);
    return savings ? this.t().pricing.savings(formatUsd(savings.amountUsd), savings.percent) : null;
  }

  /** Query params para el CTA hacia /register — el onboarding (PayFlow) toma el
   *  plan y el ciclo de facturación elegidos acá, no hay selector propio ahí. */
  registerQueryParams(plan: PlanResponse): { plan: string; cycle: 'Monthly' | 'Yearly' } {
    return { plan: plan.id, cycle: this.isAnnual() ? 'Yearly' : 'Monthly' };
  }

  featuresFor(plan: PlanResponse): string[] {
    const usersLabel = this.t().pricing.users(plan.maxUsers);
    const storage = plan.storageQuotaBytes > 0 ? [this.t().pricing.storage(storageLabel(plan.storageQuotaBytes))] : [];
    const moduleLabels = plan.enabledModules.map((key) => moduleLabel(key, this.lang()));
    return [usersLabel, ...storage, ...moduleLabels];
  }
}
