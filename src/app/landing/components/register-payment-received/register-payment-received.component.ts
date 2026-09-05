import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import type { OnboardingStatusValue, ReconcileOnboardingPaymentResponse } from '@core/onboarding/onboarding.models';

interface ConfettiPiece {
  left: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
  size: number;
}

const CONFETTI_COLORS = ['#67BAF4', '#1E466B', '#8CC7F5', '#FFFFFF', '#F5B942'];
const CONFETTI_COUNT = 44;
const POLL_INTERVAL_MS = 2500;
const MAX_RECONCILE_ATTEMPTS = 8;

type PaymentReceivedStep = 'checking' | 'redirecting' | 'processing' | 'fallback' | 'failed';
const FAILURE_STATUSES: OnboardingStatusValue[] = ['PaymentFailed', 'Cancelled', 'Refunded'];

@Component({
  selector: 'app-register-payment-received',
  imports: [RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register-payment-received.component.html',
  styleUrl: './register-payment-received.component.css',
})
export class RegisterPaymentReceivedComponent implements OnInit, OnDestroy {
  private readonly onboarding = inject(OnboardingService);
  protected readonly t = inject(TranslationStore).t;
  protected readonly step = signal<PaymentReceivedStep>('checking');
  protected readonly failureMessage = signal('');
  private attemptCount = 0;
  private pollTimerId: ReturnType<typeof setTimeout> | null = null;

  protected readonly confetti: ConfettiPiece[] = Array.from({ length: CONFETTI_COUNT }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.6 + Math.random() * 1.8,
    rotation: Math.random() * 360,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 6 + Math.random() * 6,
  }));

  ngOnInit(): void {
    this.reconcile();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  protected retryReconcile(): void {
    this.attemptCount = 0;
    this.failureMessage.set('');
    this.stopPolling();
    this.reconcile();
  }

  private reconcile(): void {
    this.step.set(this.attemptCount === 0 ? 'checking' : 'processing');
    this.onboarding.reconcilePayment().subscribe({
      next: (response) => this.handleReconcileResponse(response),
      error: () => this.showFallback(),
    });
  }

  private handleReconcileResponse(response: ReconcileOnboardingPaymentResponse): void {
    if (response.registrationUrl) {
      this.step.set('redirecting');
      this.navigateToRegistration(response.registrationUrl);
      return;
    }

    if (FAILURE_STATUSES.includes(response.status)) {
      this.failureMessage.set(response.failureMessage || '');
      this.step.set('failed');
      return;
    }

    if (response.status === 'RegistrationPending') {
      this.showFallback();
      return;
    }

    this.scheduleRetryOrFallback();
  }

  private scheduleRetryOrFallback(): void {
    this.attemptCount++;
    if (this.attemptCount >= MAX_RECONCILE_ATTEMPTS) {
      this.showFallback();
      return;
    }

    this.step.set('processing');
    this.pollTimerId = setTimeout(() => this.reconcile(), POLL_INTERVAL_MS);
  }

  private showFallback(): void {
    this.stopPolling();
    this.step.set('fallback');
  }

  private navigateToRegistration(url: string): void {
    if (typeof window === 'undefined') return;
    window.location.href = url;
  }

  private stopPolling(): void {
    if (this.pollTimerId !== null) {
      clearTimeout(this.pollTimerId);
      this.pollTimerId = null;
    }
  }
}
