import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { DemoBookingService } from '@landing/demo-booking.service';

/** Trazos (24×24, estilo lucide) de los iconos de la historia. Van en línea para no depender de ionicons. */
const ICON = {
  doc: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z M14 2v4a2 2 0 0 0 2 2h4 M10 9H8 M16 13H8 M16 17H8',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8 M12 17.5v-11',
  pen: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z',
  send: 'm22 2-7 20-4-9-9-4Z M22 2 11 13',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  check: 'M20 6 9 17l-5-5',
};

/**
 * Hero con la "historia" de un día en la oficina. Los pendientes de la izquierda son absorbidos uno a
 * uno por el motor de Taxoffix (el panel central), que ejecuta la acción que corresponde (pedir el
 * documento, enviar el enlace de pago…), y el resultado sale flotando por la derecha. El ciclo (19 s)
 * está escrito en CSS (hero.component.css). Nombres y fotos son de ejemplo.
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

  protected readonly items = [0, 1, 2, 3];
  /** El mismo cliente a ambos lados: misma foto antes y después. */
  protected readonly avatars = ['img/a1.jpg', 'img/a2.jpg', 'img/a3.jpg', 'img/a4.jpg'];
  /** Qué falta (izquierda) y qué hace el motor (centro), en el mismo orden que el copy. */
  protected readonly pendingIcons = [ICON.doc, ICON.calendar, ICON.receipt, ICON.pen];
  protected readonly actionIcons = [ICON.send, ICON.bell, ICON.link, ICON.pen];
  protected readonly checkIcon = ICON.check;
  protected readonly counts = [0, 1, 2, 3, 4];
}
