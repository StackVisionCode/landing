import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PLATFORM_BRAND, PLATFORM_LEGAL_NAME } from '@core/config/site-config';

@Component({
  selector: 'app-footer',
  imports: [FormsModule, RouterLink],
  templateUrl: './footer.component.html',
})
export class FooterComponent {
  /** Marca y razón social de la plataforma (site-config), nunca escritas en el template. */
  protected readonly brand = PLATFORM_BRAND;
  protected readonly legalName = PLATFORM_LEGAL_NAME;

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
