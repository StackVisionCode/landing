import { Component, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';
import { BookingModalComponent } from '@shared/ui/booking-modal/booking-modal.component';

@Component({
  selector: 'app-cta',
  imports: [BookingModalComponent],
  templateUrl: './cta.component.html',
  styleUrl: './cta.component.css',
})
export class CtaComponent {
  protected readonly t = inject(TranslationStore).t;
  protected readonly bookingId = SITE_CONFIG.booking.cta;
  protected readonly showBooking = signal(false);
}
