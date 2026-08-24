import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { ModalComponent } from '@shared/ui/modal/modal.component';
import { AuthService } from '@core/auth/auth.service';
import { LoginCredentials, UserProfile } from '@core/auth/auth.models';
import { ExistingSessionModalComponent } from './existing-session-modal.component';

/**
 * Modal de inicio de sesión conectado al backend del landing (flujo portado
 * de LandingPageTaxProSuite): login con detección de sesión existente (409 →
 * pantalla de force-login). Tras un login exitoso emite `loginSuccess`.
 * Sin registro — las cuentas se crean desde la app.
 */
@Component({
  selector: 'app-auth-modal',
  imports: [FormsModule, ModalComponent, ExistingSessionModalComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './auth-modal.component.html',
})
export class AuthModalComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() loginSuccess = new EventEmitter<UserProfile>();
  @Output() forgotPassword = new EventEmitter<void>();

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly t = inject(TranslationStore).t;

  protected readonly showLoginPassword = signal(false);
  protected readonly loginError = signal('');
  protected readonly isLoggingIn = signal(false);

  protected readonly loginEmail = signal('');
  protected readonly loginPassword = signal('');
  protected readonly rememberMe = signal(false);

  // Estado del flujo de sesión existente (409 en el login)
  protected readonly showExistingSessionModal = signal(false);
  protected readonly isForceLoggingIn = signal(false);
  private pendingCredentials: LoginCredentials | null = null;

  submitLogin(): void {
    if (this.isLoggingIn()) {
      return;
    }
    this.loginError.set('');

    if (!this.loginEmail().trim() || !this.loginPassword()) {
      this.loginError.set(this.t().authErrorRequiredFields);
      return;
    }
    if (!this.isValidEmail(this.loginEmail())) {
      this.loginError.set(this.t().authErrorInvalidEmail);
      return;
    }

    const credentials: LoginCredentials = {
      email: this.loginEmail(),
      password: this.loginPassword(),
      remember: this.rememberMe(),
    };

    this.isLoggingIn.set(true);
    this.authService.login(credentials).subscribe({
      next: (result) => {
        this.isLoggingIn.set(false);
        if (result.success && result.user) {
          this.loginSuccess.emit(result.user);
          this.close();
        } else if (result.existingSession) {
          this.pendingCredentials = credentials;
          this.showExistingSessionModal.set(true);
        } else {
          this.loginError.set(result.error || this.t().authErrorConnection);
        }
      },
      error: () => {
        this.isLoggingIn.set(false);
        this.loginError.set(this.t().authErrorConnection);
      },
    });
  }

  onForceLogin(): void {
    if (!this.pendingCredentials) {
      return;
    }
    this.isForceLoggingIn.set(true);

    this.authService.forceLogin(this.pendingCredentials).subscribe({
      next: (result) => {
        this.isForceLoggingIn.set(false);
        this.showExistingSessionModal.set(false);
        this.pendingCredentials = null;
        if (result.success && result.user) {
          this.loginSuccess.emit(result.user);
          this.close();
        } else {
          this.loginError.set(result.error || this.t().authErrorConnection);
        }
      },
      error: () => {
        this.isForceLoggingIn.set(false);
        this.showExistingSessionModal.set(false);
        this.pendingCredentials = null;
        this.loginError.set(this.t().authErrorConnection);
      },
    });
  }

  onCancelForceLogin(): void {
    this.showExistingSessionModal.set(false);
    this.pendingCredentials = null;
    this.loginError.set(this.t().authLoginCancelled);
  }

  close(): void {
    this.closed.emit();
    this.resetState();
  }

  goToForgotPassword(): void {
    this.forgotPassword.emit();
    this.close();
    this.router.navigateByUrl('/forgot-password');
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private resetState(): void {
    this.loginError.set('');
    this.loginEmail.set('');
    this.loginPassword.set('');
    this.rememberMe.set(false);
    this.showLoginPassword.set(false);
    this.isLoggingIn.set(false);
    this.showExistingSessionModal.set(false);
    this.isForceLoggingIn.set(false);
    this.pendingCredentials = null;
  }
}
