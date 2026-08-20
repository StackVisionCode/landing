import { Component, Input } from '@angular/core';

/**
 * Tarjeta "Aether": shell blanco `rounded-[28px] p-6`, sin borde ni sombra
 * por defecto — se diferencia del fondo degradado de la página por ser
 * sólida, no por elevación. Título/subtítulo opcionales arriba del contenido
 * proyectado, igual que en los widgets del dashboard de TaxVsion_Front.
 */
@Component({
  selector: 'app-card',
  templateUrl: './card.component.html',
})
export class CardComponent {
  @Input() heading = '';
  @Input() subheading = '';
}
