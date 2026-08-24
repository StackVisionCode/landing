import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PlansService } from '@core/plans/plans.service';
import type { PlanResponse } from '@core/plans/plans.models';

/** Etiquetas legibles para los `enabledModules` que devuelve el backend —
 *  decorativas, se mantienen aparte del sistema de i18n de copy de marca. */
const MODULE_LABELS: Record<string, { es: string; en: string }> = {
  signatures: { es: 'Firmas electrónicas', en: 'E-signatures' },
  documents: { es: 'Gestión de documentos', en: 'Document management' },
  planner: { es: 'Planificador de tareas', en: 'Task planner' },
  customers: { es: 'Gestión de clientes', en: 'Client management' },
  email: { es: 'Correo integrado', en: 'Integrated email' },
  reports: { es: 'Reportes', en: 'Reports' },
  campaigns: { es: 'Campañas de marketing', en: 'Marketing campaigns' },
  comms: { es: 'Comunicación con clientes', en: 'Client communication' },
  marketing: { es: 'Herramientas de marketing', en: 'Marketing tools' },
  miles: { es: 'Registro de millaje', en: 'Mileage tracking' },
  builder: { es: 'Constructor de formularios', en: 'Form builder' },
  irs: { es: 'Herramientas para el IRS', en: 'IRS tools' },
};

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
    const moduleLabels = plan.enabledModules.map((key) => {
      const entry = MODULE_LABELS[key];
      if (!entry) {
        return key;
      }
      return isEn ? entry.en : entry.es;
    });
    return [usersLabel, ...moduleLabels];
  }
}
