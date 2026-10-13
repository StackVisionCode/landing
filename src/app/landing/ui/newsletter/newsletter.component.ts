import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';

@Component({
  selector: 'app-newsletter',
  imports: [FormsModule, RouterLink],
  templateUrl: './newsletter.component.html',
})
export class NewsletterComponent {
  protected readonly t = inject(TranslationStore).c;

  protected readonly email = signal('');
  protected readonly subscribed = signal(false);

  subscribe(): void {
    if (!this.email().trim()) return;
    this.subscribed.set(true);
    this.email.set('');
  }
}
