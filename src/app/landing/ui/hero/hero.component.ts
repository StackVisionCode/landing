import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { DemoBookingService } from '@landing/demo-booking.service';

/**
 * Hero con la "historia": a la izquierda lo que hoy tiene una oficina
 * (falta un documento, vence en 3 días…), una barra de luz al centro (Taxoffix)
 * y a la derecha el mismo cliente ya resuelto. Los nombres y fotos son de ejemplo.
 */
@Component({
  selector: 'app-hero',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent {
  protected readonly t = inject(TranslationStore).c;
  protected readonly booking = inject(DemoBookingService);

  protected readonly before = ['img/a1.jpg', 'img/a2.jpg', 'img/a3.jpg', 'img/a4.jpg'];
  protected readonly after = ['img/r1.jpg', 'img/r2.jpg', 'img/r3.jpg', 'img/r4.jpg'];
  protected readonly rows = [0, 1, 2, 3];
}
