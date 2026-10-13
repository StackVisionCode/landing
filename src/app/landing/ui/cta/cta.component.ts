import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { DemoBookingService } from '@landing/demo-booking.service';

/** CTA final + pie de página con el wordmark gigante. */
@Component({
  selector: 'app-cta',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [RouterLink],
  templateUrl: './cta.component.html',
})
export class CtaComponent {
  protected readonly t = inject(TranslationStore).c;
  protected readonly booking = inject(DemoBookingService);
  protected readonly year = new Date().getFullYear();
}
