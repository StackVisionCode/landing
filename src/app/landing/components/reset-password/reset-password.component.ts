import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { PasswordResetService } from '@core/auth/password-reset.service';

type ResetStep = 'otp' | 'password' | 'success' | 'invalid';

const OTP_LENGTH = 8;
const OTP_DURATION_SECONDS = 300; // 5 minutos
const REDIRECT_SECONDS = 5;

/**
 * Página /reset-password (portada de LandingPageTaxProSuite): se abre desde
 * el link del correo (?email=&token=), dispara automáticamente un OTP de 8
 * dígitos, lo valida y deja fijar la nueva contraseña. Al terminar, redirige
 * al inicio tras una cuenta regresiva.
 */
@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly passwordResetService = inject(PasswordResetService);
  protected readonly t = inject(TranslationStore).t;

  protected readonly step = signal<ResetStep>('otp');

  private email = '';
  private token = '';

  protected readonly otp = signal('');
  protected readonly isSendingOtp = signal(false);
  protected readonly isValidatingOtp = signal(false);
  protected readonly otpError = signal('');
  protected readonly otpSecondsLeft = signal(OTP_DURATION_SECONDS);
  private otpTimerId: ReturnType<typeof setInterval> | null = null;

  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly showNewPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);
  protected readonly isResetting = signal(false);
  protected readonly passwordError = signal('');

  protected readonly redirectSecondsLeft = signal(REDIRECT_SECONDS);
  private redirectTimerId: ReturnType<typeof setInterval> | null = null;

  get otpTimerDisplay(): string {
    const seconds = this.otpSecondsLeft();
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.email = params.get('email') || '';
    this.token = params.get('token') || '';

    if (!this.email || !this.token) {
      this.step.set('invalid');
      return;
    }

    this.sendOtp(true);
  }

  ngOnDestroy(): void {
    this.stopOtpTimer();
    this.stopRedirectTimer();
  }

  sendOtp(silent = false): void {
    if (!silent) {
      this.isSendingOtp.set(true);
    }
    this.otpError.set('');

    this.passwordResetService.sendOtp({ email: this.email, token: this.token }).subscribe((result) => {
      this.isSendingOtp.set(false);
      if (result.success) {
        this.startOtpTimer();
      } else {
        this.otpError.set(result.error || this.t().authErrorConnection);
      }
    });
  }

  resendOtp(): void {
    this.stopOtpTimer();
    this.otp.set('');
    this.otpError.set('');
    this.sendOtp();
  }

  onOtpInput(value: string): void {
    this.otp.set(value.replace(/\D/g, '').slice(0, OTP_LENGTH));
  }

  validateOtp(): void {
    if (this.isValidatingOtp()) {
      return;
    }
    this.otpError.set('');

    if (this.otp().length !== OTP_LENGTH) {
      this.otpError.set(this.t().rpOtpErrorLength);
      return;
    }

    this.isValidatingOtp.set(true);
    this.passwordResetService.validateOtp({ email: this.email, otp: this.otp() }).subscribe((result) => {
      this.isValidatingOtp.set(false);
      if (result.success) {
        this.stopOtpTimer();
        this.step.set('password');
      } else {
        this.otpError.set(result.error || this.t().authErrorConnection);
      }
    });
  }

  resetPassword(): void {
    if (this.isResetting()) {
      return;
    }
    this.passwordError.set('');

    if (!this.newPassword() || !this.confirmPassword()) {
      this.passwordError.set(this.t().authErrorRequiredFields);
      return;
    }
    if (this.newPassword().length < 6) {
      this.passwordError.set(this.t().authErrorPasswordLength);
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set(this.t().authErrorPasswordMismatch);
      return;
    }

    this.isResetting.set(true);
    this.passwordResetService
      .resetPassword({ email: this.email, newPassword: this.newPassword(), token: this.token })
      .subscribe((result) => {
        this.isResetting.set(false);
        if (result.success) {
          this.step.set('success');
          this.startRedirectTimer();
        } else {
          this.passwordError.set(result.error || this.t().authErrorConnection);
        }
      });
  }

  goToLogin(): void {
    this.stopRedirectTimer();
    this.router.navigateByUrl('/');
  }

  private startOtpTimer(): void {
    this.stopOtpTimer();
    this.otpSecondsLeft.set(OTP_DURATION_SECONDS);
    this.otpTimerId = setInterval(() => {
      const next = this.otpSecondsLeft() - 1;
      this.otpSecondsLeft.set(Math.max(next, 0));
      if (next <= 0) {
        this.stopOtpTimer();
      }
    }, 1000);
  }

  private stopOtpTimer(): void {
    if (this.otpTimerId !== null) {
      clearInterval(this.otpTimerId);
      this.otpTimerId = null;
    }
  }

  private startRedirectTimer(): void {
    this.redirectSecondsLeft.set(REDIRECT_SECONDS);
    this.redirectTimerId = setInterval(() => {
      const next = this.redirectSecondsLeft() - 1;
      this.redirectSecondsLeft.set(next);
      if (next <= 0) {
        this.goToLogin();
      }
    }, 1000);
  }

  private stopRedirectTimer(): void {
    if (this.redirectTimerId !== null) {
      clearInterval(this.redirectTimerId);
      this.redirectTimerId = null;
    }
  }
}
