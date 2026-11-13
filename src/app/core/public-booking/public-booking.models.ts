/**
 * Contrato de la API pública de demos de Calendar (`/calendar/public/*`), verificado contra
 * `PublicBookingContracts.cs` y `PublicBookingRequests.cs`. Fechas en ISO UTC; enums como texto.
 */

export type BookingFieldMode = 'Hidden' | 'Optional' | 'Required';

export type OfficeSize =
  'JustMe' | 'TwoToFive' | 'SixToFifteen' | 'SixteenToFifty' | 'MoreThanFifty';

export const OFFICE_SIZES: readonly OfficeSize[] = [
  'JustMe',
  'TwoToFive',
  'SixToFifteen',
  'SixteenToFifty',
  'MoreThanFifty',
];

/** Botón del landing que abrió la reserva; `Direct` es la ruta `/demo`. */
export type BookingEntrySource = 'Direct' | 'Hero' | 'Benefits' | 'Team' | 'Faq' | 'Cta';

export type BookingLanguage = 'En' | 'Es';

export interface PublicHeardAboutOption {
  readonly code: string;
  readonly label: string;
  readonly allowsDetail: boolean;
}

export interface PublicBookingPage {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly durationMinutes: number;
  readonly maxDaysAhead: number;
  readonly requiresVerification: boolean;
  readonly bookingAvailable: boolean;
  readonly turnstileSiteKey: string | null;
  readonly phoneField: BookingFieldMode;
  readonly officeSizeField: BookingFieldMode;
  readonly interestField: BookingFieldMode;
  readonly heardAboutOptions: readonly PublicHeardAboutOption[];
  readonly privacyNotice: string;
  readonly marketingConsent: string;
  readonly consentVersion: string;
  /** Quién puede dar la demo (solo el nombre). */
  readonly hosts: readonly { readonly displayName: string }[];
}

export interface PublicBookingSlotsResponse {
  readonly slots: readonly { readonly startUtc: string }[];
}

export interface PublicBookingCreateRequest {
  readonly slotStartUtc: string;
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly officeSize: OfficeSize | null;
  readonly phone: string | null;
  readonly interest: string | null;
  readonly heardAboutCode: string;
  readonly heardAboutDetail: string | null;
  readonly entrySource: BookingEntrySource;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly referrerDomain: string | null;
  readonly language: BookingLanguage;
  readonly timeZone: string;
  readonly marketingOptIn: boolean;
  readonly consentVersion: string;
  readonly botToken: string | null;
}

export interface PublicBookingRequestAccepted {
  readonly requestHandle: string;
  readonly holdExpiresAtUtc: string;
}

export interface PublicBookingConfirmation {
  readonly status: string;
  readonly startUtc: string;
  readonly durationMinutes: number;
  readonly hostName: string;
  readonly meetingUrl: string;
  readonly icsUid: string;
  readonly icsSequence: number;
}

export interface PublicBookingManageView {
  readonly status: 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow' | string;
  readonly startUtc: string;
  readonly durationMinutes: number;
  readonly title: string;
  readonly hostName: string;
  readonly meetingUrl: string;
  readonly timeZone: string;
  readonly pageSlug: string;
  readonly canChange: boolean;
}

export interface PublicBookingRescheduled {
  readonly booking: PublicBookingManageView;
  readonly managementToken: string;
}

/** Códigos estables de `PublicBookingErrors` que el landing distingue. */
export const PUBLIC_BOOKING_ERRORS = {
  notFound: 'Calendar.PublicBooking.NotFound',
  slotTaken: 'Calendar.PublicBooking.SlotTaken',
  holdExpired: 'Calendar.PublicBooking.HoldExpired',
  notPending: 'Calendar.PublicBooking.NotPending',
  tooManyAttempts: 'Calendar.PublicBooking.TooManyAttempts',
  invalidCode: 'Calendar.PublicBooking.InvalidCode',
  notVerified: 'Calendar.PublicBooking.NotVerified',
  consentOutdated: 'Calendar.PublicBooking.ConsentOutdated',
  slotInPast: 'Calendar.PublicBooking.SlotInPast',
  nameRequired: 'Calendar.PublicBooking.NameRequired',
  nameTooLong: 'Calendar.PublicBooking.NameTooLong',
  emailInvalid: 'Calendar.PublicBooking.EmailInvalid',
  companyRequired: 'Calendar.PublicBooking.CompanyRequired',
  companyTooLong: 'Calendar.PublicBooking.CompanyTooLong',
  phoneInvalid: 'Calendar.PublicBooking.PhoneInvalid',
  textInvalid: 'Calendar.PublicBooking.TextInvalid',
  interestRequired: 'Calendar.PublicBooking.InterestRequired',
  interestTooLong: 'Calendar.PublicBooking.InterestTooLong',
  heardAboutRequired: 'Calendar.PublicBooking.HeardAboutRequired',
  heardAboutDetailTooLong: 'Calendar.PublicBooking.HeardAboutDetailTooLong',
  fieldRequired: 'Calendar.PublicBooking.FieldRequired',
  alreadyHappened: 'Calendar.PublicBooking.AlreadyHappened',
  notConfirmed: 'Calendar.PublicBooking.NotConfirmed',
  reasonTooLong: 'Calendar.PublicBooking.ReasonTooLong',
} as const;
