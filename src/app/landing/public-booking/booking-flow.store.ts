import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActionCooldown } from '@core/http/action-cooldown';
import { apiErrorCode } from '@core/http/api-error';
import { readThrottle } from '@core/http/throttling';
import { TranslationStore } from '@core/i18n/translation.store';
import { readAttribution, sessionStore } from '@core/public-booking/attribution';
import { emailSuggestion } from '@core/public-booking/email-suggestion';
import { PublicBookingApi } from '@core/public-booking/public-booking.api';
import {
  PUBLIC_BOOKING_ERRORS as E,
  type BookingEntrySource,
  type OfficeSize,
  type PublicBookingConfirmation,
  type PublicBookingPage,
} from '@core/public-booking/public-booking.models';
import { SlotBrowser } from './slot-browser';

export type FlowStep = 'slot' | 'details' | 'verify' | 'confirmed';
export type PageState = 'loading' | 'ready' | 'unavailable' | 'error';
export type FlowNotice =
  | 'slotTaken'
  | 'holdExpired'
  | 'pickAnother'
  | 'network'
  | 'throttled'
  | 'consentOutdated'
  | 'botCheck'
  | 'text'
  | 'generic'
  | 'resent';

export type FieldKey =
  | 'name'
  | 'email'
  | 'company'
  | 'officeSize'
  | 'phone'
  | 'interest'
  | 'heardAbout'
  | 'heardAboutDetail'
  | 'code';
export type FieldError = 'required' | 'email' | 'tooLong' | 'phone' | 'invalidCode';

export interface DetailsForm {
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly officeSize: OfficeSize | '';
  readonly phone: string;
  readonly interest: string;
  readonly heardAboutCode: string;
  readonly heardAboutDetail: string;
  readonly marketingOptIn: boolean;
}

export const EMPTY_FORM: DetailsForm = {
  name: '',
  email: '',
  company: '',
  officeSize: '',
  phone: '',
  interest: '',
  heardAboutCode: '',
  heardAboutDetail: '',
  marketingOptIn: false,
};

/** Slug de la página de reservas del landing (F9 la crea con este slug). */
export const DEMO_PAGE_SLUG = 'demo';

// Mismos topes que los VOs de Calendar.
const LIMITS = {
  name: 200,
  email: 320,
  company: 200,
  phone: 30,
  interest: 500,
  heardAboutDetail: 100,
} as const;
const RESEND_WAIT_SECONDS = 60;

/**
 * Flujo de "Book a live demo" (DEMO-08): elegir horario → datos → código → confirmada. Los datos del paso 2
 * se conservan al volver o si falla la red. Los errores del backend llegan por código estable, nunca por texto.
 */
@Injectable()
export class BookingFlowStore implements OnDestroy {
  private readonly api = inject(PublicBookingApi);
  private readonly translation = inject(TranslationStore);

  readonly pageState = signal<PageState>('loading');
  readonly page = signal<PublicBookingPage | null>(null);
  readonly step = signal<FlowStep>('slot');
  readonly picker = new SlotBrowser(this.api, (err) => this.fail(err));
  readonly selectedSlot = signal<string | null>(null);
  readonly form = signal<DetailsForm>(EMPTY_FORM);
  readonly fieldErrors = signal<Partial<Record<FieldKey, FieldError>>>({});
  /** Campos que el visitante ya completó bien (llevan ✓). */
  readonly validFields = signal<ReadonlySet<FieldKey>>(new Set());
  readonly notice = signal<FlowNotice | null>(null);
  readonly busy = signal(false);
  readonly holdExpiresAt = signal<number | null>(null);
  /** El código ya probó el email pero el horario se ocupó: el próximo horario se elige sin repetir el código. */
  readonly awaitingNewSlot = signal(false);
  readonly confirmation = signal<PublicBookingConfirmation | null>(null);
  readonly now = signal(Date.now());

  /** Los primeros horarios libres de la ventana: la mayoría reserva lo primero que le sirve. */
  readonly quickPicks = computed(() => [...this.picker.slots()].sort().slice(0, 3));
  /** "¿Quisiste decir …?" cuando el dominio del email parece mal escrito. */
  readonly emailSuggestion = computed(() => emailSuggestion(this.form().email));
  readonly firstName = computed(() => this.form().name.trim().split(/\s+/)[0] ?? '');

  /** Hay algo que se perdería al salir. Confirmada, ya no: la demo quedó guardada. */
  readonly hasProgress = computed(
    () =>
      this.step() !== 'confirmed' &&
      (this.step() !== 'slot' || this.selectedSlot() !== null || this.form() !== EMPTY_FORM),
  );

  readonly cooldown = new ActionCooldown();
  readonly resendCooldown = new ActionCooldown();

  readonly holdSecondsLeft = computed(() => {
    const expires = this.holdExpiresAt();
    return expires === null ? 0 : Math.max(0, Math.ceil((expires - this.now()) / 1000));
  });

  private source: BookingEntrySource = 'Direct';
  private requestHandle: string | null = null;
  private idempotencyKey: string | null = null;
  private lastCode = '';
  private clock: ReturnType<typeof setInterval> | null = null;

  start(source: BookingEntrySource): void {
    this.source = source;
    this.loadPage();
  }

  /** Reloj de la cuenta atrás; solo en el navegador. */
  startClock(): void {
    this.stopClock();
    this.clock = setInterval(() => this.tick(Date.now()), 1000);
  }

  stopClock(): void {
    if (this.clock !== null) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  ngOnDestroy(): void {
    this.stopClock();
    this.cooldown.stop();
    this.resendCooldown.stop();
  }

  tick(now: number): void {
    this.now.set(now);
    this.picker.now.set(now);
    const expires = this.holdExpiresAt();
    if (this.step() === 'verify' && expires !== null && now >= expires) {
      this.restartRequest('holdExpired');
    }
  }

  loadPage(): void {
    if (!this.page()) {
      this.pageState.set('loading');
    }
    this.api.page(DEMO_PAGE_SLUG, this.translation.lang()).subscribe({
      next: (page) => {
        this.page.set(page);
        this.picker.maxDaysAhead.set(page.maxDaysAhead);
        this.pageState.set(page.bookingAvailable ? 'ready' : 'unavailable');
        if (page.bookingAvailable && this.picker.slug() === null) {
          this.picker.slug.set(page.slug);
          this.picker.load();
        }
      },
      error: (err: unknown) => {
        if (!this.page()) {
          this.pageState.set(
            isNetwork(err) || (err instanceof HttpErrorResponse && err.status >= 500)
              ? 'error'
              : 'unavailable',
          );
        }
      },
    });
  }

  loadSlots(): void {
    this.picker.load();
  }

  selectSlot(startUtc: string): void {
    this.selectedSlot.set(startUtc);
    if (this.awaitingNewSlot() && this.requestHandle) {
      this.chooseNewSlot(this.requestHandle, startUtc);
      return;
    }
    this.notice.set(null);
    // Otro horario es otro pedido: clave de idempotencia nueva.
    this.idempotencyKey = null;
    this.step.set('details');
  }

  backToSlots(): void {
    this.notice.set(null);
    this.step.set('slot');
  }

  editDetails(): void {
    this.notice.set(null);
    this.idempotencyKey = null;
    this.step.set('details');
  }

  updateForm(patch: Partial<DetailsForm>): void {
    this.form.update((form) => ({ ...form, ...patch }));
    const cleared = { ...this.fieldErrors() };
    const valid = new Set(this.validFields());
    for (const key of Object.keys(patch)) {
      const field = (key === 'heardAboutCode' ? 'heardAbout' : key) as FieldKey;
      delete cleared[field];
      valid.delete(field);
    }
    this.fieldErrors.set(cleared);
    this.validFields.set(valid);
  }

  /** Valida en el navegador con las mismas reglas que Calendar; devuelve si se puede enviar. */
  validate(): boolean {
    const errors = this.errorsOf(this.form());
    this.fieldErrors.set(errors);
    this.validFields.set(new Set());
    return Object.keys(errors).length === 0;
  }

  /** Al salir de un campo: su error o su ✓, sin adelantarse a los que no se tocaron (Baymard). */
  checkField(key: FieldKey): void {
    const errors = this.errorsOf(this.form());
    const next = { ...this.fieldErrors() };
    const valid = new Set(this.validFields());
    if (errors[key]) {
      next[key] = errors[key];
      valid.delete(key);
    } else {
      delete next[key];
      if (this.hasValue(key)) {
        valid.add(key);
      } else {
        valid.delete(key);
      }
    }
    this.fieldErrors.set(next);
    this.validFields.set(valid);
  }

  private hasValue(key: FieldKey): boolean {
    const form = this.form();
    const values: Partial<Record<FieldKey, string>> = {
      name: form.name,
      email: form.email,
      company: form.company,
      officeSize: form.officeSize,
      phone: form.phone,
      interest: form.interest,
      heardAbout: form.heardAboutCode,
      heardAboutDetail: form.heardAboutDetail,
    };
    return (values[key] ?? '').trim().length > 0;
  }

  private errorsOf(form: DetailsForm): Partial<Record<FieldKey, FieldError>> {
    const page = this.page();
    const errors: Partial<Record<FieldKey, FieldError>> = {};
    requiredText(errors, 'name', form.name, LIMITS.name);
    requiredText(errors, 'company', form.company, LIMITS.company);
    const email = form.email.trim();
    if (!email) {
      errors.email = 'required';
    } else if (email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'email';
    }
    if (page?.officeSizeField === 'Required' && !form.officeSize) {
      errors.officeSize = 'required';
    }
    const phone = form.phone.trim();
    if (page?.phoneField === 'Required' && !phone) {
      errors.phone = 'required';
    } else if (phone && page?.phoneField !== 'Hidden' && !isPhone(phone)) {
      errors.phone = 'phone';
    }
    const interest = form.interest.trim();
    if (page?.interestField === 'Required' && !interest) {
      errors.interest = 'required';
    } else if (interest.length > LIMITS.interest) {
      errors.interest = 'tooLong';
    }
    if (!form.heardAboutCode) {
      errors.heardAbout = 'required';
    } else if (
      this.selectedOption()?.allowsDetail &&
      form.heardAboutDetail.trim().length > LIMITS.heardAboutDetail
    ) {
      errors.heardAboutDetail = 'tooLong';
    }
    return errors;
  }

  /** Paso 2 → solicitud. `botToken` null = Turnstile no respondió: no se envía (el backend respondería en silencio). */
  submit(botToken: string | null): void {
    const page = this.page();
    const slot = this.selectedSlot();
    if (!page || !slot || this.busy() || this.cooldown.active() || !this.validate()) {
      return;
    }
    if (page.turnstileSiteKey && !botToken) {
      this.notice.set('botCheck');
      return;
    }
    const form = this.form();
    const attribution = readAttribution(sessionStore());
    const option = this.selectedOption();
    this.idempotencyKey ??= newKey();
    this.busy.set(true);
    this.notice.set(null);
    this.api
      .request(
        page.slug,
        {
          slotStartUtc: slot,
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim(),
          officeSize:
            page.officeSizeField === 'Hidden' || !form.officeSize ? null : form.officeSize,
          phone: page.phoneField === 'Hidden' ? null : form.phone.trim() || null,
          interest: page.interestField === 'Hidden' ? null : form.interest.trim() || null,
          heardAboutCode: form.heardAboutCode,
          heardAboutDetail: option?.allowsDetail ? form.heardAboutDetail.trim() || null : null,
          entrySource: this.source,
          ...attribution,
          language: this.translation.lang() === 'es' ? 'Es' : 'En',
          timeZone: this.picker.timeZone(),
          marketingOptIn: form.marketingOptIn,
          consentVersion: page.consentVersion,
          botToken,
        },
        this.idempotencyKey,
      )
      .subscribe({
        next: (accepted) => {
          this.requestHandle = accepted.requestHandle;
          this.holdExpiresAt.set(Date.parse(accepted.holdExpiresAtUtc));
          this.now.set(Date.now());
          if (page.requiresVerification) {
            this.busy.set(false);
            this.step.set('verify');
            this.resendCooldown.start(RESEND_WAIT_SECONDS);
          } else {
            this.confirm(accepted.requestHandle, '');
          }
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.onRequestError(err);
        },
      });
  }

  verify(rawCode: string): void {
    const code = rawCode.replace(/\D/g, '');
    if (!this.requestHandle || this.busy() || this.cooldown.active()) {
      return;
    }
    if (code.length !== 6) {
      this.fieldErrors.set({ code: 'invalidCode' });
      return;
    }
    this.lastCode = code;
    this.confirm(this.requestHandle, code);
  }

  resend(): void {
    if (!this.requestHandle || this.resendCooldown.active() || this.cooldown.active()) {
      return;
    }
    this.api.resend(this.requestHandle).subscribe({
      next: () => {
        this.notice.set('resent');
        this.resendCooldown.start(RESEND_WAIT_SECONDS);
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  selectedOption() {
    const code = this.form().heardAboutCode;
    return this.page()?.heardAboutOptions.find((option) => option.code === code) ?? null;
  }

  private confirm(handle: string, code: string): void {
    this.busy.set(true);
    this.notice.set(null);
    this.api.verify(handle, code).subscribe({
      next: (confirmation) => {
        this.busy.set(false);
        this.awaitingNewSlot.set(false);
        this.holdExpiresAt.set(null);
        this.confirmation.set(confirmation);
        this.step.set('confirmed');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.onVerifyError(err);
      },
    });
  }

  /** Email ya probado y horario ocupado: se toma el nuevo y se confirma con el mismo código. */
  private chooseNewSlot(handle: string, startUtc: string): void {
    this.busy.set(true);
    this.notice.set(null);
    this.api.chooseSlot(handle, startUtc).subscribe({
      next: () => this.confirm(handle, this.lastCode),
      error: (err: unknown) => {
        this.busy.set(false);
        this.onVerifyError(err);
      },
    });
  }

  private onRequestError(err: unknown): void {
    const code = apiErrorCode(err);
    const field = fieldOf(code);
    if (field) {
      this.fieldErrors.set({ [field.key]: field.error });
      return;
    }
    switch (code) {
      case E.slotTaken:
      case E.slotInPast:
        this.slotTaken();
        return;
      case E.consentOutdated:
        this.notice.set('consentOutdated');
        this.loadPage();
        return;
      case E.textInvalid:
        this.notice.set('text');
        return;
      case E.notFound:
        this.pageState.set('unavailable');
        return;
      default:
        this.fail(err);
    }
  }

  private onVerifyError(err: unknown): void {
    switch (apiErrorCode(err)) {
      case E.invalidCode:
        this.fieldErrors.set({ code: 'invalidCode' });
        return;
      case E.slotTaken:
      case E.slotInPast:
        this.awaitingNewSlot.set(true);
        this.slotTaken();
        return;
      case E.holdExpired:
      case E.notPending:
      case E.tooManyAttempts:
      case E.notVerified:
        this.restartRequest('holdExpired');
        return;
      default:
        this.fail(err);
    }
  }

  private slotTaken(): void {
    this.selectedSlot.set(null);
    this.step.set('slot');
    this.notice.set(this.awaitingNewSlot() ? 'pickAnother' : 'slotTaken');
    this.loadSlots();
  }

  /** La solicitud ya no sirve: se elige horario de nuevo, con los datos intactos. */
  private restartRequest(notice: FlowNotice): void {
    this.requestHandle = null;
    this.idempotencyKey = null;
    this.lastCode = '';
    this.awaitingNewSlot.set(false);
    this.holdExpiresAt.set(null);
    this.selectedSlot.set(null);
    this.step.set('slot');
    this.notice.set(notice);
    this.loadSlots();
  }

  private fail(err: unknown): void {
    const throttle = readThrottle(err);
    if (throttle) {
      this.cooldown.start(throttle.retryAfterSeconds);
      this.notice.set('throttled');
      return;
    }
    this.notice.set(isNetwork(err) ? 'network' : 'generic');
  }
}

function isNetwork(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 0;
}

function requiredText(
  errors: Partial<Record<FieldKey, FieldError>>,
  key: FieldKey,
  value: string,
  max: number,
): void {
  const trimmed = value.trim();
  if (!trimmed) {
    errors[key] = 'required';
  } else if (trimmed.length > max) {
    errors[key] = 'tooLong';
  }
}

/** Mismo criterio que `ProspectPhone`: dígitos y separadores comunes, de 7 a 15 dígitos. */
function isPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '').length;
  return (
    value.length <= LIMITS.phone && /^[\d\s+\-().]+$/.test(value) && digits >= 7 && digits <= 15
  );
}

function fieldOf(code: string | null): { key: FieldKey; error: FieldError } | null {
  switch (code) {
    case E.nameRequired:
      return { key: 'name', error: 'required' };
    case E.nameTooLong:
      return { key: 'name', error: 'tooLong' };
    case E.emailInvalid:
      return { key: 'email', error: 'email' };
    case E.companyRequired:
      return { key: 'company', error: 'required' };
    case E.companyTooLong:
      return { key: 'company', error: 'tooLong' };
    case E.phoneInvalid:
      return { key: 'phone', error: 'phone' };
    case E.interestRequired:
      return { key: 'interest', error: 'required' };
    case E.interestTooLong:
      return { key: 'interest', error: 'tooLong' };
    case E.heardAboutRequired:
      return { key: 'heardAbout', error: 'required' };
    case E.heardAboutDetailTooLong:
      return { key: 'heardAboutDetail', error: 'tooLong' };
    default:
      return null;
  }
}

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
