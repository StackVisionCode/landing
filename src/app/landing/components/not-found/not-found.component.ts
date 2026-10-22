import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PLATFORM_BRAND } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Ruta desconocida. Sin ella el router no encontraba coincidencia y la página quedaba en blanco.
 * Ofrece las dos salidas que de verdad usa la gente que llega acá: el inicio y su suscripción.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  protected readonly t = inject(TranslationStore).t;
  protected readonly brand = PLATFORM_BRAND;

  /** Lemniscata del loader de marca: dos lazos unidos en el centro (32,16). */
  protected readonly path =
    'M32 16 C24 4 14 4 10 4 C5 4 2 9 2 16 C2 23 5 28 10 28 C14 28 24 28 32 16 C40 4 50 4 54 4 C59 4 62 9 62 16 C62 23 59 28 54 28 C50 28 40 28 32 16 Z';
}
