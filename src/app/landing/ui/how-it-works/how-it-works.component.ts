import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';

@Component({
  selector: 'app-how-it-works',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [RouterLink],
  templateUrl: './how-it-works.component.html',
})
export class HowItWorksComponent {
  protected readonly t = inject(TranslationStore).c;
  protected readonly bars = [30, 50, 70, 100];
}
