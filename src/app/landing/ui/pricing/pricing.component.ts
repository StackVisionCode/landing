import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PlansService } from '@core/plans/plans.service';
import { moduleLabel } from '@core/plans/module-labels';
import type { PlanResponse } from '@core/plans/plans.models';

/**
 * Precios reales, obtenidos de GET /plans (Subscription.Api) — reemplaza los
 * tres planes que estaban hardcodeados (Free/Standard/Pro con precios
 * inventados). El catálogo real no tiene plan gratuito: starter/pro/
 * enterprise, todos pagos.
 */
@Component({
  selector: 'app-pricing',
  imports: [RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './pricing.component.html',
})
export class PricingComponent {
  private readonly plansService = inject(PlansService);
  private readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;
  protected readonly lang = this.translation.lang;
  protected readonly isAnnual = signal(false);

  protected readonly plans = signal<PlanResponse[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly hasError = signal(false);

  constructor() {
    this.loadPlans();
  }

  retryLoadPlans(): void {
    this.loadPlans();
  }

  private loadPlans(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.plansService.getPlans().subscribe({
      next: (plans) => {
        this.plans.set([...plans].sort((a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd));
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  priceFor(plan: PlanResponse): number {
    const cycle = this.isAnnual() ? 'Yearly' : 'Monthly';
    return plan.pricesUsdByCycle[cycle] ?? plan.monthlyPriceUsd;
  }

  isHighlighted(plan: PlanResponse): boolean {
    return plan.code === 'pro';
  }

  /** Query params para el CTA hacia /register — el onboarding (PayFlow) toma el
   *  plan y el ciclo de facturación elegidos acá, no hay selector propio ahí. */
  registerQueryParams(plan: PlanResponse): { plan: string; cycle: 'Monthly' | 'Yearly' } {
    return { plan: plan.id, cycle: this.isAnnual() ? 'Yearly' : 'Monthly' };
  }

  featuresFor(plan: PlanResponse): string[] {
    const isEn = this.lang() === 'en';
    const usersLabel = isEn ? `Up to ${plan.maxUsers} users` : `Hasta ${plan.maxUsers} usuarios`;
    const moduleLabels = plan.enabledModules.map((key) => moduleLabel(key, this.lang()));
    return [usersLabel, ...moduleLabels];
  }
}
