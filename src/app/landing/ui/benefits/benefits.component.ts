import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { DemoBookingService } from '@landing/demo-booking.service';

@Component({
  selector: 'app-benefits',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './benefits.component.html',
})
export class BenefitsComponent {
  protected readonly t = inject(TranslationStore).c;
  protected readonly booking = inject(DemoBookingService);

  /** Alturas (%) decorativas de las barras del mini gráfico. */
  protected readonly bars = [35, 55, 30, 70, 45, 90, 60];
}
