import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { DEFAULT_WAIT_SECONDS, formatClock, readThrottle } from './throttling';

function httpError(status: number, body: unknown, headers?: Record<string, string>): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, headers: new HttpHeaders(headers ?? {}) });
}

describe('readThrottle', () => {
  it('reads the wait from the rate limit body', () => {
    const throttle = readThrottle(httpError(429, { code: 'RateLimit.Exceeded', retryAfterSeconds: 42 }));

    expect(throttle).toEqual({ kind: 'rate-limited', code: null, retryAfterSeconds: 42 });
  });

  it('keeps the business code of a domain throttle and its wait', () => {
    const throttle = readThrottle(httpError(429, { code: 'Onboarding.ResendCooldown', retryAfterSeconds: 58 }));

    expect(throttle).toEqual({ kind: 'rate-limited', code: 'Onboarding.ResendCooldown', retryAfterSeconds: 58 });
  });

  it('falls back to the Retry-After header in seconds', () => {
    const throttle = readThrottle(httpError(429, null, { 'Retry-After': '17' }));

    expect(throttle?.retryAfterSeconds).toBe(17);
  });

  it('accepts Retry-After as an HTTP date', () => {
    const inThirtySeconds = new Date(Date.now() + 30_000).toUTCString();

    const throttle = readThrottle(httpError(429, null, { 'Retry-After': inThirtySeconds }));

    expect(throttle?.retryAfterSeconds).toBeGreaterThan(25);
    expect(throttle?.retryAfterSeconds).toBeLessThanOrEqual(31);
  });

  it('uses a default wait when the backend does not report one', () => {
    expect(readThrottle(httpError(429, null))?.retryAfterSeconds).toBe(DEFAULT_WAIT_SECONDS);
  });

  it('treats gateway load shedding as overloaded', () => {
    const throttle = readThrottle(httpError(503, { code: 'LoadShedding.Active', retryAfterSeconds: 5 }));

    expect(throttle).toEqual({ kind: 'overloaded', code: null, retryAfterSeconds: 5 });
  });

  it('ignores errors that are not a wait', () => {
    expect(readThrottle(httpError(400, { code: 'Onboarding.OtpMismatch' }))).toBeNull();
    expect(readThrottle(httpError(503, { type: 'Auth.SessionDenylistUnavailable' }))).toBeNull();
    expect(readThrottle(httpError(503, null))).toBeNull();
    expect(readThrottle(new Error('boom'))).toBeNull();
  });
});

describe('formatClock', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatClock(58)).toBe('0:58');
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(0)).toBe('0:00');
  });
});
