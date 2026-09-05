import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { SITE_CONFIG } from '@core/config/site-config';
import { apiErrorCode } from '@core/onboarding/onboarding-error.util';
import { suggestSubdomainFromOfficeName } from '@core/onboarding/subdomain-suggestion.util';
import type { OnboardingStatusValue } from '@core/onboarding/onboarding.models';

type CompleteStep = 'loading' | 'invalid' | 'form' | 'provisioning' | 'completed' | 'failed' | 'manual-review';
type SubdomainStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'reserved';
// El backend distingue 3 motivos bajo el mismo "token inválido" (API_Contract.md
// §2.7/§2.8) — colapsarlos en un solo mensaje genérico es engañoso: a alguien con
// TokenUsed ya se le cobró y terminó el registro (necesita loguearse, no pagar de
// nuevo); a alguien con TokenExpired también se le cobró pero el link venció antes
// de completar el form (no hay endpoint de reenvío todavía — no hay que insinuar
// que pague otra vez); solo InvalidToken (o falta de token) es un link genuinamente
// nunca válido, donde sí tiene sentido mandar de vuelta a elegir plan.
type InvalidReason = 'no-token' | 'used' | 'expired' | 'generic';

const SUBDOMAIN_DEBOUNCE_MS = 500;
const POLL_INTERVAL_MS = 2500;
const REDIRECT_SECONDS = 5;
// Mismo criterio del backend (SubdomainSlug.Create): 3-63, minúsculas/dígitos/guiones,
// sin guion inicial/final — la validación real de "xn--" y reservados la hace el servidor.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

const TERMINAL_FAILURE_STATUSES: OnboardingStatusValue[] = [
  'ProvisioningFailed',
  'Cancelled',
  'Expired',
  'Refunded',
];

/**
 * Página /register/complete: se abre desde el link de "completa tu registro"
 * del correo (?token=RegistrationToken). Precarga datos + términos vigentes,
 * reserva subdominio, completa el registro y hace poll del estado hasta que
 * el provisioning (Saga) termine.
 */
@Component({
  selector: 'app-register-complete',
  imports: [FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register-complete.component.html',
})
export class RegisterCompleteComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly onboarding = inject(OnboardingService);
  protected readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;

  protected readonly step = signal<CompleteStep>('loading');
  protected readonly invalidReason = signal<InvalidReason>('generic');
  protected readonly appUrl = SITE_CONFIG.appUrl;
  protected readonly firstName = signal('');
  protected readonly planName = signal<string | null>(null);
  protected readonly maskedEmail = signal('');

  private token = '';
  private termsVersionId = '';
  private termsContentUri = '';

  protected readonly officeName = signal('');
  protected readonly subdomain = signal('');
  protected readonly subdomainStatus = signal<SubdomainStatus>('idle');
  private subdomainEditedByUser = false;
  private subdomainTimerId: ReturnType<typeof setTimeout> | null = null;

  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly showPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);
  protected readonly termsAccepted = signal(false);

  protected readonly showTermsModal = signal(false);
  protected readonly isLoadingTerms = signal(false);
  protected readonly termsContent = signal('');

  protected readonly isSubmitting = signal(false);
  protected readonly formError = signal('');

  protected readonly failureReason = signal('');
  protected readonly redirectUrl = signal('');
  protected readonly redirectSecondsLeft = signal(REDIRECT_SECONDS);
  private redirectTimerId: ReturnType<typeof setInterval> | null = null;

  private pollTimerId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.invalidReason.set('no-token');
      this.step.set('invalid');
      return;
    }
    this.loadPreviewAndTerms();
  }

  ngOnDestroy(): void {
    this.stopSubdomainTimer();
    this.stopPolling();
    this.stopRedirectCountdown();
  }

  openTerms(): void {
    this.showTermsModal.set(true);
    if (this.termsContent() || !this.termsContentUri) return;

    this.isLoadingTerms.set(true);
    this.onboarding.getTermsContent(this.termsContentUri).subscribe({
      next: (html) => {
        this.termsContent.set(html);
        this.isLoadingTerms.set(false);
      },
      error: () => this.isLoadingTerms.set(false),
    });
  }

  closeTerms(): void {
    this.showTermsModal.set(false);
  }

  onOfficeNameInput(value: string): void {
    this.officeName.set(value);
    if (this.subdomainEditedByUser) return;

    this.applySubdomainInput(suggestSubdomainFromOfficeName(value));
  }

  onSubdomainInput(value: string): void {
    this.subdomainEditedByUser = true;
    this.applySubdomainInput(value);
  }

  private applySubdomainInput(value: string): void {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    this.subdomain.set(normalized);
    this.subdomainStatus.set('idle');
    this.stopSubdomainTimer();

    if (normalized.length === 0) return;
    if (normalized.length < 3 || !SUBDOMAIN_PATTERN.test(normalized)) {
      this.subdomainStatus.set('invalid');
      return;
    }

    this.subdomainTimerId = setTimeout(() => this.checkSubdomain(normalized), SUBDOMAIN_DEBOUNCE_MS);
  }

  submit(): void {
    if (this.isSubmitting()) return;
    this.formError.set('');

    if (!this.officeName().trim() || !this.password() || !this.confirmPassword()) {
      this.formError.set(this.t().compErrorRequiredFields);
      return;
    }
    if (!this.subdomain()) {
      this.formError.set(this.t().compErrorSubdomainRequired);
      return;
    }
    if (this.subdomainStatus() !== 'available') {
      this.formError.set(this.t().compErrorSubdomainNotAvailable);
      return;
    }
    if (this.password().length < 12) {
      this.formError.set(this.t().compErrorPasswordLength);
      return;
    }
    if (this.password() !== this.confirmPassword()) {
      this.formError.set(this.t().compErrorPasswordMismatch);
      return;
    }
    if (!this.termsAccepted()) {
      this.formError.set(this.t().compErrorTermsRequired);
      return;
    }

    this.isSubmitting.set(true);
    this.onboarding
      .completeRegistration({
        token: this.token,
        password: this.password(),
        officeName: this.officeName().trim(),
        subdomain: this.subdomain(),
        termsAccepted: true,
        termsVersionId: this.termsVersionId,
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.step.set('provisioning');
          this.poll();
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.handleSubmitError(apiErrorCode(err));
        },
      });
  }

  goToOffice(): void {
    this.stopRedirectCountdown();
    if (typeof window !== 'undefined' && this.redirectUrl()) {
      window.location.href = this.redirectUrl();
    }
  }

  private loadPreviewAndTerms(): void {
    this.onboarding.previewRegistration(this.token).subscribe({
      next: (preview) => {
        this.firstName.set(preview.firstName);
        this.planName.set(preview.planName);
        this.maskedEmail.set(preview.maskedEmail);
        this.loadTerms();
      },
      error: (err) => {
        this.invalidReason.set(this.mapInvalidReason(apiErrorCode(err)));
        this.step.set('invalid');
      },
    });
  }

  private mapInvalidReason(code: string | null): InvalidReason {
    if (code === 'Onboarding.TokenUsed') return 'used';
    if (code === 'Onboarding.TokenExpired') return 'expired';
    return 'generic';
  }

  private loadTerms(): void {
    // El middleware de aceptación fija "en-US" como locale por defecto de la
    // versión vigente (TermsAcceptanceMiddleware.DefaultLocale) — se pide la
    // misma acá para no arriesgar un TermsVersion.NotFound si "es" nunca se publicó.
    this.onboarding.getCurrentTerms('en-US').subscribe({
      next: (terms) => {
        this.termsVersionId = terms.termsVersionId;
        this.termsContentUri = terms.contentUri || '';
        this.step.set('form');
      },
      error: () => this.step.set('invalid'),
    });
  }

  private checkSubdomain(slug: string): void {
    this.subdomainStatus.set('checking');
    this.onboarding.checkSubdomain({ slug, token: this.token }).subscribe({
      next: (res) => {
        if (this.subdomain() !== slug) return; // respuesta obsoleta, el usuario siguió escribiendo
        this.subdomainStatus.set(res.available ? 'available' : 'taken');
      },
      error: () => {
        if (this.subdomain() !== slug) return;
        this.subdomainStatus.set('invalid');
      },
    });
  }

  private handleSubmitError(code: string | null): void {
    if (code === 'Onboarding.TermsVersionNotCurrent') {
      this.termsAccepted.set(false);
      this.termsContent.set('');
      this.loadTerms();
      this.formError.set(this.t().compErrorTermsRequired);
      return;
    }
    if (code === 'Onboarding.SubdomainNotReserved') {
      this.subdomainStatus.set('idle');
      this.formError.set(this.t().compSubdomainReserved);
      return;
    }
    if (code === 'Onboarding.InvalidToken' || code === 'Onboarding.TokenUsed' || code === 'Onboarding.TokenExpired') {
      this.invalidReason.set(this.mapInvalidReason(code));
      this.step.set('invalid');
      return;
    }
    if (code === 'User.Password') {
      this.formError.set(this.t().compErrorPasswordPolicy);
      return;
    }
    this.formError.set(this.t().compFailedBody);
  }

  private poll(): void {
    this.onboarding.getStatus(this.token).subscribe({
      next: (res) => this.handleStatus(res.status, res.failureReason, res.redirectUrl),
      error: () => {
        this.pollTimerId = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
      },
    });
  }

  private handleStatus(
    status: OnboardingStatusValue,
    failureReason: string | null,
    redirectUrl: string | null,
  ): void {
    if (status === 'Completed') {
      this.redirectUrl.set(redirectUrl || '');
      this.step.set('completed');
      this.startRedirectCountdown();
      return;
    }
    if (status === 'ManualReview') {
      this.step.set('manual-review');
      return;
    }
    if (TERMINAL_FAILURE_STATUSES.includes(status)) {
      this.failureReason.set(failureReason || '');
      this.step.set('failed');
      return;
    }
    this.pollTimerId = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
  }

  private startRedirectCountdown(): void {
    this.redirectSecondsLeft.set(REDIRECT_SECONDS);
    this.redirectTimerId = setInterval(() => {
      const next = this.redirectSecondsLeft() - 1;
      this.redirectSecondsLeft.set(next);
      if (next <= 0) this.goToOffice();
    }, 1000);
  }

  private stopRedirectCountdown(): void {
    if (this.redirectTimerId !== null) {
      clearInterval(this.redirectTimerId);
      this.redirectTimerId = null;
    }
  }

  private stopPolling(): void {
    if (this.pollTimerId !== null) {
      clearTimeout(this.pollTimerId);
      this.pollTimerId = null;
    }
  }

  private stopSubdomainTimer(): void {
    if (this.subdomainTimerId !== null) {
      clearTimeout(this.subdomainTimerId);
      this.subdomainTimerId = null;
    }
  }
}
