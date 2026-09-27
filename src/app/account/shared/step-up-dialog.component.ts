import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { apiErrorCode } from '@core/http/api-error';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Confirmación de contraseña antes de una acción sensible (cambiar de plan). La pide el backend con un 401
 * `Auth.ReauthenticationRequired`; acá se resuelve y se avisa a la pantalla para que reintente.
 */
@Component({
  selector: 'app-step-up-dialog',
  imports: [FormsModule],
  templateUrl: './step-up-dialog.component.html',
})
export class StepUpDialogComponent {
  private readonly session = inject(AccountSessionStore);
  private readonly i18n = inject(TranslationStore);

  /** La elevación quedó hecha: la pantalla reintenta lo que el backend había rechazado. */
  readonly confirmed = output<void>();
  readonly dismissed = output<void>();

  readonly t = this.i18n.t;
  readonly password = signal('');
  readonly code = signal('');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.submitting() || this.password().length === 0) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.session.elevate({ password: this.password(), code: this.code() || null }).subscribe({
      next: () => {
        this.password.set('');
        this.code.set('');
        this.submitting.set(false);
        this.confirmed.emit();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(this.messageFor(err));
      },
    });
  }

  dismiss(): void {
    this.password.set('');
    this.code.set('');
    this.error.set(null);
    this.dismissed.emit();
  }

  /**
   * El backend decide; la pantalla solo traduce. Una contraseña mala NO cierra la sesión.
   *
   * Los códigos son los que emite `ReauthenticateHandler` de verdad. Antes esperaba
   * `Auth.InvalidCredentials`, `Auth.TwoFactorRequired` y `User.Locked`, que **no existen**: los
   * reales son `Auth.ReauthenticationFailed`, `Auth.MfaCodeRequired` y `Auth.LockedOut`. Con
   * ninguno coincidiendo, TODO caía en el mensaje genérico — y el peor caso era "te falta el código
   * del autenticador", que se leía como "contraseña incorrecta" y dejaba al usuario reintentando
   * la contraseña para siempre.
   */
  private messageFor(err: unknown): string {
    const t = this.t();
    switch (apiErrorCode(err)) {
      case 'Auth.ReauthenticationFailed':
        return t.accStepUpWrongPassword;
      case 'Auth.MfaCodeRequired':
        return t.accStepUpCodeRequired;
      case 'Auth.LockedOut':
        return t.accStepUpLocked;
      case 'Auth.SessionRevoked':
        return t.accStepUpSessionEnded;
      default:
        return t.accStepUpError;
    }
  }
}
