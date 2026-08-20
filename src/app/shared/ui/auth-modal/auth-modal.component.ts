import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationStore } from '@core/i18n/translation.store';
import { ModalComponent } from '@shared/ui/modal/modal.component';

export interface LoginSubmitPayload {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface RegisterSubmitPayload {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  phoneNumber: string;
  password: string;
}

type AuthTab = 'login' | 'register';

/**
 * Modal de login/registro (portado de LandingPageTaxProSuite) — presentacional:
 * valida en cliente y emite los datos por output. Sin llamadas a backend todavía;
 * `loginSubmit`/`registerSubmit` quedan listos para conectarse a un AuthService real.
 */
@Component({
  selector: 'app-auth-modal',
  imports: [FormsModule, ModalComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './auth-modal.component.html',
})
export class AuthModalComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() loginSubmit = new EventEmitter<LoginSubmitPayload>();
  @Output() registerSubmit = new EventEmitter<RegisterSubmitPayload>();
  @Output() forgotPassword = new EventEmitter<void>();

  protected readonly t = inject(TranslationStore).t;

  protected readonly activeTab = signal<AuthTab>('login');
  protected readonly showLoginPassword = signal(false);
  protected readonly showRegisterPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);
  protected readonly loginError = signal('');
  protected readonly registerError = signal('');

  protected readonly loginEmail = signal('');
  protected readonly loginPassword = signal('');
  protected readonly rememberMe = signal(false);

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly registerEmail = signal('');
  protected readonly companyName = signal('');
  protected readonly phoneNumber = signal('');
  protected readonly registerPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly agreeToTerms = signal(false);

  onPhoneChange(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    let formatted = digits;
    if (digits.length >= 6) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length >= 3) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    this.phoneNumber.set(formatted);
  }

  submitLogin(): void {
    this.loginError.set('');

    if (!this.loginEmail().trim() || !this.loginPassword()) {
      this.loginError.set(this.t().authErrorRequiredFields);
      return;
    }
    if (!this.isValidEmail(this.loginEmail())) {
      this.loginError.set(this.t().authErrorInvalidEmail);
      return;
    }

    this.loginSubmit.emit({
      email: this.loginEmail(),
      password: this.loginPassword(),
      rememberMe: this.rememberMe(),
    });
    this.close();
  }

  submitRegister(): void {
    this.registerError.set('');

    if (
      !this.firstName().trim() ||
      !this.lastName().trim() ||
      !this.registerEmail().trim() ||
      !this.registerPassword() ||
      !this.confirmPassword()
    ) {
      this.registerError.set(this.t().authErrorRequiredFields);
      return;
    }
    if (!this.isValidEmail(this.registerEmail())) {
      this.registerError.set(this.t().authErrorInvalidEmail);
      return;
    }
    if (this.registerPassword() !== this.confirmPassword()) {
      this.registerError.set(this.t().authErrorPasswordMismatch);
      return;
    }
    if (this.registerPassword().length < 6) {
      this.registerError.set(this.t().authErrorPasswordLength);
      return;
    }

    const phoneDigits = this.phoneNumber().replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length !== 10) {
      this.registerError.set(this.t().authErrorPhoneDigits);
      return;
    }
    if (!this.agreeToTerms()) {
      this.registerError.set(this.t().authErrorTermsRequired);
      return;
    }

    this.registerSubmit.emit({
      firstName: this.firstName(),
      lastName: this.lastName(),
      email: this.registerEmail(),
      companyName: this.companyName(),
      phoneNumber: phoneDigits,
      password: this.registerPassword(),
    });
    this.close();
  }

  close(): void {
    this.closed.emit();
    this.resetState();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private resetState(): void {
    this.activeTab.set('login');
    this.loginError.set('');
    this.registerError.set('');
    this.loginEmail.set('');
    this.loginPassword.set('');
    this.rememberMe.set(false);
    this.firstName.set('');
    this.lastName.set('');
    this.registerEmail.set('');
    this.companyName.set('');
    this.phoneNumber.set('');
    this.registerPassword.set('');
    this.confirmPassword.set('');
    this.agreeToTerms.set(false);
    this.showLoginPassword.set(false);
    this.showRegisterPassword.set(false);
    this.showConfirmPassword.set(false);
  }
}
