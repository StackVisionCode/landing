import { passwordGuideMet, passwordGuideRules, PasswordGuideRule } from './password-guide';

const rule = (rules: PasswordGuideRule[], id: string) => rules.find((r) => r.id === id);

describe('passwordGuideRules', () => {
  it('counts the length against the minimum; the 128 limit only shows when exceeded', () => {
    expect(rule(passwordGuideRules({ password: 'abc', minLength: 15 }), 'length')).toEqual({
      id: 'length',
      met: false,
      count: 3,
      min: 15,
    });
    expect(
      rule(passwordGuideRules({ password: 'abc', minLength: 15 }), 'maxLength'),
    ).toBeUndefined();
    const long = passwordGuideRules({ password: 'abcd efgh '.repeat(13), minLength: 15 });
    expect(rule(long, 'maxLength')?.met).toBe(false);
    expect(rule(long, 'length')?.met).toBe(false);
  });

  it('flags common passwords: base word with digits/symbols, repeats and sequences', () => {
    const common = (password: string) =>
      rule(passwordGuideRules({ password, minLength: 15 }), 'common')?.met;
    expect(common('Password2024!!!!')).toBe(false);
    expect(common('aaaaaaaaaaaaaaa')).toBe(false);
    expect(common('my 12345678 dog')).toBe(false);
    expect(common('a calm river at dawn')).toBe(true);
  });

  it('always checks the product name; the office only when known', () => {
    const brand = rule(
      passwordGuideRules({ password: 'i love taxoffix a lot', minLength: 15 }),
      'context',
    );
    expect(brand).toEqual({ id: 'context', met: false, office: false });
    const office = rule(
      passwordGuideRules({
        password: 'acme rocks forever',
        minLength: 15,
        contextWords: ['Acme Tax'],
      }),
      'context',
    );
    expect(office).toEqual({ id: 'context', met: false, office: true });
  });

  it('a short email name (under 4 letters) is not a rule, like the backend', () => {
    expect(rule(passwordGuideRules({ password: 'mango orchard by the river', minLength: 15, email: 'm@x.com' }), 'email')).toBeUndefined();
  });

  it('email, current and confirmation only when the screen passes them', () => {
    const base = { password: 'a calm river at dawn', minLength: 15 };
    expect(rule(passwordGuideRules(base), 'email')).toBeUndefined();
    expect(rule(passwordGuideRules(base), 'match')).toBeUndefined();
    expect(rule(passwordGuideRules({ ...base, email: 'calm@x.com' }), 'email')?.met).toBe(false);
    expect(rule(passwordGuideRules({ ...base, confirm: 'nope' }), 'match')?.met).toBe(false);
    expect(passwordGuideMet(passwordGuideRules({ ...base, confirm: base.password }))).toBe(true);
    expect(passwordGuideMet(passwordGuideRules({ password: '', minLength: 15, confirm: '' }))).toBe(
      false,
    );
  });
});
