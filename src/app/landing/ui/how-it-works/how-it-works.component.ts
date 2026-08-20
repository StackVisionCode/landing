import { Component, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';

@Component({
  selector: 'app-how-it-works',
  templateUrl: './how-it-works.component.html',
})
export class HowItWorksComponent {
  protected readonly t = inject(TranslationStore).t;
}
