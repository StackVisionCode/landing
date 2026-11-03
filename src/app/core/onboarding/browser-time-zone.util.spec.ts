import { browserTimeZone } from './browser-time-zone.util';

describe('browserTimeZone', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the IANA zone the browser resolves', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    } as Intl.DateTimeFormat);

    expect(browserTimeZone()).toBe('America/New_York');
  });

  it('returns undefined when the zone is not exposed', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: '' }),
    } as unknown as Intl.DateTimeFormat);

    expect(browserTimeZone()).toBeUndefined();
  });

  it('never throws when Intl fails', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('unsupported');
    });

    expect(browserTimeZone()).toBeUndefined();
  });
});
