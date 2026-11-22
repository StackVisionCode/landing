import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PlansService } from './plans.service';
import type { PlanResponse } from './plans.models';
import { byRank } from './plan-pricing';

/**
 * Catálogo de planes a la venta, cargado una sola vez para toda la landing (precios, FAQ y el CTA de
 * "cómo funciona"). Cuántos planes hay, su orden y cuál se destaca vienen del backend.
 */
@Injectable({ providedIn: 'root' })
export class PlanCatalogStore {
  private readonly plansService = inject(PlansService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private requested = false;

  readonly plans = signal<PlanResponse[]>([]);
  readonly isLoading = signal(false);
  readonly hasError = signal(false);

  /** El único plan a la venta, o null si hay varios (o ninguno). */
  readonly single = computed(() => (this.plans().length === 1 ? this.plans()[0] : null));

  load(force = false): void {
    if (this.requested && !force) {
      return;
    }
    this.requested = true;
    this.isLoading.set(true);
    this.hasError.set(false);
    this.plansService.getPlans().subscribe({
      next: (plans) => {
        this.plans.set([...plans].sort(byRank));
        this.isLoading.set(false);
        // El inicio se prerenderiza con los precios del build: en el navegador se piden otra vez en vivo.
        if (this.isBrowser) this.refreshLive();
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  private refreshLive(): void {
    this.plansService.getPlans(true).subscribe({
      next: (plans) => this.plans.set([...plans].sort(byRank)),
      // Sin red se queda lo que ya se pintó.
      error: () => undefined,
    });
  }

  /** Nombre visible de un plan a la venta; si ya no se vende, el código. */
  nameOf(code: string): string {
    return this.plans().find((plan) => plan.code === code)?.name ?? code;
  }
}
