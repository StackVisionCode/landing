import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { MODULE_LABELS, moduleIcon, moduleLabel } from '@core/plans/module-labels';

interface MarqueeFeature {
  icon: string;
  label: string;
}

/**
 * Fila de tarjetas que fluye en loop infinito bajo el hero — reemplazo del
 * mockup de Dashboard (quitado "hasta nuevo aviso"). Mismo catálogo de los 12
 * módulos reales (MODULE_LABELS, compartido con Pricing/Register/
 * features-grid) — todo lo que ofrece el producto, no una selección curada.
 */
@Component({
  selector: 'app-feature-marquee',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './feature-marquee.component.html',
  styleUrl: './feature-marquee.component.css',
})
export class FeatureMarqueeComponent {
  private readonly translation = inject(TranslationStore);

  protected get features(): MarqueeFeature[] {
    const lang = this.translation.lang();
    return Object.keys(MODULE_LABELS).map((key) => ({
      icon: moduleIcon(key),
      label: moduleLabel(key, lang),
    }));
  }

  /** Duplicado x2 para el loop sin costuras — el track anima 0 → -50% y cae
   *  exacto sobre la primera copia. */
  protected get loopFeatures(): MarqueeFeature[] {
    return [...this.features, ...this.features];
  }
}
