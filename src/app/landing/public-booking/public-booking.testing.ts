import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import type {
  PublicBookingConfirmation,
  PublicBookingCreateRequest,
  PublicBookingPage,
} from '@core/public-booking/public-booking.models';

/** Dobles de prueba de la reserva pública (no es un spec: lo importan varios). */
export const SLOT_A = '2026-11-18T15:00:00Z';
export const SLOT_B = '2026-11-18T16:00:00Z';

export const PAGE: PublicBookingPage = {
  slug: 'demo',
  title: 'Book a live demo',
  description: 'See it live.',
  durationMinutes: 30,
  maxDaysAhead: 60,
  requiresVerification: true,
  bookingAvailable: true,
  turnstileSiteKey: null,
  phoneField: 'Optional',
  officeSizeField: 'Optional',
  interestField: 'Optional',
  heardAboutOptions: [
    { code: 'google_search', label: 'Google search', allowsDetail: false },
    { code: 'other', label: 'Other', allowsDetail: true },
  ],
  privacyNotice:
    'We use this information only to schedule your demo. See our [Privacy Policy](/privacy).',
  marketingConsent: 'Send me product news.',
  consentVersion: '2026-11-demo-v1',
  hosts: [{ displayName: 'María Pérez' }, { displayName: 'Ben Cole' }],
};

export const CONFIRMED: PublicBookingConfirmation = {
  status: 'Confirmed',
  startUtc: SLOT_A,
  durationMinutes: 30,
  hostName: 'María Pérez',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  icsUid: 'public-booking-0f1e2d3c4b5a69788796a5b4c3d2e1f0',
  icsSequence: 0,
};

export function problem(
  status: number,
  code: string | null,
  headers?: Record<string, string>,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: code ? { code, message: 'x' } : null,
    headers: headers ? new HttpHeaders(headers) : undefined,
  });
}

/** API en memoria: cada método devuelve lo que la prueba programó y registra lo que recibió. */
export class FakePublicBookingApi {
  pageResult: () => Observable<PublicBookingPage> = () => of(PAGE);
  slotsResult: () => Observable<{ slots: { startUtc: string }[] }> = () =>
    of({ slots: [{ startUtc: SLOT_A }, { startUtc: SLOT_B }] });
  requestResult: () => Observable<unknown> = () =>
    of({
      requestHandle: 'handle-1',
      holdExpiresAtUtc: new Date(Date.now() + 600_000).toISOString(),
    });
  verifyResult: () => Observable<unknown> = () => of(CONFIRMED);
  chooseResult: () => Observable<unknown> = () => of({});
  resendResult: () => Observable<unknown> = () => of({});

  readonly requests: { body: PublicBookingCreateRequest; key: string }[] = [];
  readonly verifies: { handle: string; code: string }[] = [];
  readonly chosen: string[] = [];
  slotCalls = 0;
  resends = 0;

  page = () => this.pageResult();
  slots = () => {
    this.slotCalls++;
    return this.slotsResult();
  };
  request = (_slug: string, body: PublicBookingCreateRequest, key: string) => {
    this.requests.push({ body, key });
    return this.requestResult();
  };
  verify = (handle: string, code: string) => {
    this.verifies.push({ handle, code });
    return this.verifyResult();
  };
  chooseSlot = (_handle: string, slot: string) => {
    this.chosen.push(slot);
    return this.chooseResult();
  };
  resend = () => {
    this.resends++;
    return this.resendResult();
  };
}
