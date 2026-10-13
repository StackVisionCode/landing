import { Injectable, signal } from '@angular/core';
import { SITE_CONFIG } from '@core/config/site-config';

type BookingSource = keyof typeof SITE_CONFIG.booking;

/** Estado del modal "Programar Demo": un solo modal en la página, cada botón indica desde dónde se abrió. */
@Injectable({ providedIn: 'root' })
export class DemoBookingService {
  readonly isOpen = signal(false);
  readonly bookingId = signal<string>(SITE_CONFIG.booking.hero);

  open(source: BookingSource = 'hero'): void {
    this.bookingId.set(SITE_CONFIG.booking[source]);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
