import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { ChipComponent } from '@shared/ui/chip/chip.component';

@Component({
  selector: 'app-features-grid',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ChipComponent],
  templateUrl: './features-grid.component.html',
})
export class FeaturesGridComponent {
  protected readonly t = inject(TranslationStore).t;
}
