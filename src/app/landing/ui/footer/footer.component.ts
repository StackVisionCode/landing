import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationStore } from '@core/i18n/translation.store';

@Component({
  selector: 'app-footer',
  imports: [FormsModule],
  templateUrl: './footer.component.html',
})
export class FooterComponent {
  protected readonly t = inject(TranslationStore).t;
  protected readonly year = new Date().getFullYear();

  protected readonly email = signal('');
  protected readonly subscribed = signal(false);

  subscribe(): void {
    if (!this.email().trim()) return;
    this.subscribed.set(true);
    this.email.set('');
  }
}
