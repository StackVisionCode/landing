import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Pantalla de "sesión activa detectada" (portada de LandingPageTaxProSuite):
 * aparece sobre el auth-modal cuando el login devuelve 409 y deja elegir entre
 * cancelar o cerrar la sesión del otro dispositivo (force-login).
 */
@Component({
  selector: 'app-existing-session-modal',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './existing-session-modal.component.html',
})
export class ExistingSessionModalComponent {
  @Input() isOpen = false;
  @Input() isLoading = false;
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  protected readonly t = inject(TranslationStore).t;

  onOverlayClick(): void {
    if (!this.isLoading) {
      this.cancelled.emit();
    }
  }
}
