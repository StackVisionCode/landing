import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { RegisterCompleteComponent } from './register-complete.component';

function rateLimited(retryAfterSeconds: number) {
  return new HttpErrorResponse({ status: 429, error: { code: 'RateLimit.Exceeded', retryAfterSeconds } });
}

describe('RegisterCompleteComponent', () => {
  // Con el token de la URL, el init precarga preview y términos y deja el formulario listo.
  function create(overrides: object = {}) {
    const onboarding = {
      previewRegistration: vi.fn(() => of({ firstName: 'Ada', lastName: 'Lovelace', maskedEmail: 'a***@example.com', planName: 'Pro' })),
      getCurrentTerms: vi.fn(() => of({ termsVersionId: 'terms-1', contentUri: null })),
      ...overrides,
    };
    TestBed.configureTestingModule({
      imports: [RegisterCompleteComponent],
      providers: [
        { provide: OnboardingService, useValue: onboarding },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'tok' } } } },
      ],
    });
    const fixture = TestBed.createComponent(RegisterCompleteComponent);
    fixture.detectChanges();
    return fixture.componentInstance as any;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('closes the terms modal on Escape (a11y)', () => {
    const component = create();

    component.showTermsModal.set(true);
    component.onEscape();

    expect(component.showTermsModal()).toBe(false);
  });

  it('does nothing on Escape when the modal is already closed', () => {
    const component = create();

    component.onEscape();

    expect(component.showTermsModal()).toBe(false);
  });

  describe('when the backend asks to wait', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('marks the subdomain check as throttled and never retries it on its own', () => {
      const checkSubdomain = vi
        .fn()
        .mockReturnValueOnce(throwError(() => rateLimited(10)))
        .mockReturnValue(of({ available: true }));
      const component = create({ checkSubdomain });

      component.onSubdomainInput('acme-tax');
      vi.advanceTimersByTime(500);
      expect(component.subdomainStatus()).toBe('throttled');
      expect(component.subdomainCooldown.active()).toBe(true);

      component.onSubdomainInput('acme-taxes');
      vi.advanceTimersByTime(500);
      component.recheckSubdomain();
      expect(component.subdomainStatus()).toBe('throttled');
      expect(checkSubdomain).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10_000);
      component.recheckSubdomain();
      expect(checkSubdomain).toHaveBeenCalledTimes(2);
      expect(component.subdomainStatus()).toBe('available');
    });

    it('stops polling after the time limit and lets the user check again', () => {
      const getStatus = vi.fn(() => of({ status: 'Provisioning', failureReason: null, redirectUrl: null }));
      const component = create({ getStatus });

      component.checkProvisioningAgain();
      expect(component.step()).toBe('provisioning');

      vi.advanceTimersByTime(5 * 60 * 1000 + 15_000);
      expect(component.step()).toBe('slow');
      const callsWhenSlow = getStatus.mock.calls.length;

      vi.advanceTimersByTime(60_000);
      expect(getStatus).toHaveBeenCalledTimes(callsWhenSlow);

      component.checkProvisioningAgain();
      expect(component.step()).toBe('provisioning');
      expect(getStatus).toHaveBeenCalledTimes(callsWhenSlow + 1);
    });

    it('waits the time the backend asked for before polling the status again', () => {
      const getStatus = vi
        .fn()
        .mockReturnValueOnce(throwError(() => rateLimited(12)))
        .mockReturnValue(of({ status: 'Provisioning', failureReason: null, redirectUrl: null }));
      const component = create({ getStatus });

      component.checkProvisioningAgain();
      vi.advanceTimersByTime(11_000);
      expect(getStatus).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      expect(getStatus).toHaveBeenCalledTimes(2);
    });
  });
});
