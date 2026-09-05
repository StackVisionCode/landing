import { suggestSubdomainFromOfficeName } from './subdomain-suggestion.util';

describe('suggestSubdomainFromOfficeName', () => {
  it('normalizes office names into editable subdomain suggestions', () => {
    expect(suggestSubdomainFromOfficeName('Mi Oficina de Impuestos')).toBe('mi-oficina-de-impuestos');
    expect(suggestSubdomainFromOfficeName('Castillo & Núñez Tax, LLC')).toBe('castillo-nunez-tax-llc');
    expect(suggestSubdomainFromOfficeName('--- Demo ---')).toBe('demo');
  });

  it('keeps suggestions within the subdomain length limit', () => {
    const suggestion = suggestSubdomainFromOfficeName('a'.repeat(80));

    expect(suggestion.length).toBe(63);
  });
});
