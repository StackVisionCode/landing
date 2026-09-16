import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { RegisterCompleteComponent } from './register-complete.component';

describe('RegisterCompleteComponent', () => {
  function create() {
    TestBed.configureTestingModule({
      imports: [RegisterCompleteComponent],
      providers: [
        { provide: OnboardingService, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'tok' } } } },
      ],
    });
    return TestBed.createComponent(RegisterCompleteComponent).componentInstance as any;
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
});
