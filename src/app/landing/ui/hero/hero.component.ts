import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';
import { BookingModalComponent } from '@shared/ui/booking-modal/booking-modal.component';

/**
 * Hero con fondo "amanecer" (índigo → morado de marca → el crema del resto
 * de la página) y una ventana de app flotante que calca el Dashboard real de
 * CRMTAXPROFRONTEND: header con el switch Módulos/Calendario y una grilla de
 * widgets (Estadísticas, Facturación, Clientes recientes) con sus mismos
 * colores de degradado suave — el contenido del mock es decorativo/estático,
 * no traducido, igual que el resto de las tarjetas del hero.
 */
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

  /** Alturas (%) de las barras del widget de facturación — puramente decorativas. */
  protected readonly invoiceBars = [45, 65, 40, 80, 55, 95, 70];
}
