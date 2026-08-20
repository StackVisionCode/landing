import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';

@Component({
  selector: 'app-products',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './products.component.html',
})
export class ProductsComponent {
  protected readonly t = inject(TranslationStore).t;
  protected readonly siteConfig = SITE_CONFIG;
}
