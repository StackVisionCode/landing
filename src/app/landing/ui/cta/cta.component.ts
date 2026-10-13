import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PLATFORM_BRAND, PLATFORM_LEGAL_NAME } from '@core/config/site-config';
import { DemoBookingService } from '@landing/demo-booking.service';

/** CTA final + pie de página con el wordmark gigante. */
@Component({
  selector: 'app-cta',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [RouterLink],
  templateUrl: './cta.component.html',
})
export class CtaComponent {
  /** Marca y razón social de la plataforma (site-config), nunca escritas en el template. */
  protected readonly brand = PLATFORM_BRAND;
  protected readonly legalName = PLATFORM_LEGAL_NAME;

  protected readonly t = inject(TranslationStore).c;
  protected readonly booking = inject(DemoBookingService);
  protected readonly year = new Date().getFullYear();
}
