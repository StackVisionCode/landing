import { TestBed } from '@angular/core/testing';
import { TranslationStore } from '@core/i18n/translation.store';
import { PasswordGuideRule } from '@core/auth/password-guide';
import { PasswordGuideComponent } from './password-guide.component';

describe('PasswordGuideComponent', () => {
  function render(rules: PasswordGuideRule[], serverError = '', lang: 'en' | 'es' = 'en') {
    TestBed.configureTestingModule({ imports: [PasswordGuideComponent] });
    TestBed.inject(TranslationStore).setLang(lang);
    const fixture = TestBed.createComponent(PasswordGuideComponent);
    fixture.componentRef.setInput('rules', rules);
    fixture.componentRef.setInput('guideId', 'pw-guide');
    fixture.componentRef.setInput('serverError', serverError);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(TranslationStore).setLang('en');
    TestBed.resetTestingModule();
  });

  const rules: PasswordGuideRule[] = [
    { id: 'length', met: false, count: 3, min: 15 },
    { id: 'common', met: true },
    { id: 'context', met: true, office: false },
    { id: 'match', met: false },
  ];

  it('renders each rule with an icon and a text state, not only color', () => {
    const { el } = render(rules);
    const items = Array.from(el.querySelectorAll('li'));
    expect(items.map((li) => li.getAttribute('data-rule'))).toEqual([
      'length',
      'common',
      'context',
      'match',
    ]);
    expect(items[0].textContent).toContain('3 / 15 characters');
    expect(items[0].textContent).toContain('not met yet');
    expect(items[1].textContent).toContain('Not a common password');
    expect(items[2].textContent).toContain("Doesn't contain the product name");
    expect(items[3].textContent).toContain('Passwords match');
    expect(items[0].querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('#pw-guide')).not.toBeNull();
  });

  it('announces progress in a discreet polite live region', () => {
    const { el } = render(rules);
    const live = el.querySelector('[aria-live="polite"]');
    expect(live?.classList.contains('sr-only')).toBe(true);
    expect(live?.textContent?.trim()).toBe('2 of 4 password requirements met.');
  });

  it('speaks Spanish when the landing is in Spanish', () => {
    const { el } = render(rules, '', 'es');
    expect(el.textContent).toContain('3 / 15 caracteres');
    expect(el.textContent).toContain('No es una contraseña común');
    expect(el.textContent).toContain('Las contraseñas coinciden');
  });

  it('shows the backend rejection next to the field', () => {
    const { el } = render(rules, 'That password does not meet our requirements.');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'That password does not meet our requirements.',
    );
  });
});
