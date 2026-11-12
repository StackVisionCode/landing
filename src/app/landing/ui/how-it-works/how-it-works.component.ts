import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PlanCatalogStore } from '@core/plans/plan-catalog.store';

@Component({
  selector: 'app-how-it-works',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [RouterLink],
  templateUrl: './how-it-works.component.html',
})
export class HowItWorksComponent {
  protected readonly t = inject(TranslationStore).c;
  private readonly catalog = inject(PlanCatalogStore);
  /** Con un solo plan a la venta no hay nada que elegir: se va directo al registro con ese plan. */
  protected readonly singlePlan = this.catalog.single;

  constructor() {
    this.catalog.load();
  }
  protected readonly bars = [30, 50, 70, 100];
}
