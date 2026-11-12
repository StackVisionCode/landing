import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { DemoBookingService } from '@landing/demo-booking.service';
import { PlanCatalogStore } from '@core/plans/plan-catalog.store';
import { priceSummary } from '@core/plans/plan-pricing';

@Component({
  selector: 'app-faq',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './faq.component.html',
})
export class FaqComponent {
  private readonly catalog = inject(PlanCatalogStore);
  private readonly summary = computed(() => priceSummary(this.catalog.plans()));
  protected readonly t = inject(TranslationStore).c;
  protected readonly booking = inject(DemoBookingService);
  protected readonly openIndex = signal<number | null>(0);

  constructor() {
    this.catalog.load();
  }

  /** La pregunta de precios se contesta con el catálogo; sin catálogo, remite a la sección Precios. */
  answerFor(item: { id?: string; a: string }): string {
    const summary = this.summary();
    return item.id === 'pricing' && summary ? this.t().faq.pricingAnswer(summary) : item.a;
  }

  toggle(index: number): void {
    this.openIndex.set(this.openIndex() === index ? null : index);
  }
}
