import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PasswordResetService } from '@core/auth/password-reset.service';

/**
 * Página "olvidé mi contraseña" (portada de LandingPageTaxProSuite,
 * ruta /forgot-password): pide el correo y dispara el link de recuperación.
 * El correo trae email+token, que abre /reset-password (paso siguiente:
 * OTP + nueva contraseña).
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private readonly passwordResetService = inject(PasswordResetService);
  protected readonly t = inject(TranslationStore).t;

  protected readonly email = signal('');
  protected readonly isLoading = signal(false);
  protected readonly isEmailSent = signal(false);
  protected readonly errorMessage = signal('');

  submit(): void {
    if (this.isLoading()) {
      return;
    }
    this.errorMessage.set('');

    if (!this.isValidEmail(this.email())) {
      this.errorMessage.set(this.t().authErrorInvalidEmail);
      return;
    }

    this.isLoading.set(true);
    this.passwordResetService.requestReset(this.email()).subscribe((result) => {
      this.isLoading.set(false);
      if (result.success) {
        this.isEmailSent.set(true);
      } else {
        this.errorMessage.set(result.error || this.t().authErrorConnection);
      }
    });
  }

  resend(): void {
    this.isEmailSent.set(false);
    this.submit();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
