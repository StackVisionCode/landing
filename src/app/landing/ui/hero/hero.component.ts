import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';
import { BookingModalComponent } from '@shared/ui/booking-modal/booking-modal.component';

@Component({
  selector: 'app-hero',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [BookingModalComponent],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent {
  protected readonly t = inject(TranslationStore).t;
  protected readonly bookingId = SITE_CONFIG.booking.hero;
  protected readonly showBooking = signal(false);

  protected readonly revenueBars = [
    { height: 45, color: '#D6CEF4' },
    { height: 65, color: '#9D8DE8' },
    { height: 50, color: '#A99BEB' },
    { height: 85, color: '#7C6AE0' },
    { height: 60, color: '#9D8DE8' },
    { height: 95, color: '#7C6AE0' },
    { height: 70, color: '#A99BEB' },
  ];
}
