import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';
import { AuthModalComponent } from '@shared/ui/auth-modal/auth-modal.component';

@Component({
  selector: 'app-navbar',
  imports: [AuthModalComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
  protected readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;
  protected readonly lang = this.translation.lang;
  protected readonly siteConfig = SITE_CONFIG;

  protected readonly mobileMenuOpen = signal(false);
  protected readonly showAuthModal = signal(false);

  openAuthModal(): void {
    this.showAuthModal.set(true);
    this.closeMobileMenu();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleLang(): void {
    this.translation.toggle();
  }
}
