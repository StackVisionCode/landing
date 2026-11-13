import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { TranslationStore } from '@core/i18n/translation.store';
import { PublicBookingApi } from '@core/public-booking/public-booking.api';
import { BookingFlowStore } from './booking-flow.store';
import {
  CONFIRMED,
  FakePublicBookingApi,
  PAGE,
  SLOT_A,
  SLOT_B,
  problem,
} from './public-booking.testing';

describe('BookingFlowStore', () => {
  let api: FakePublicBookingApi;
  let store: BookingFlowStore;

  function setUp(): void {
    TestBed.configureTestingModule({
      providers: [BookingFlowStore, { provide: PublicBookingApi, useValue: api }],
    });
    store = TestBed.inject(BookingFlowStore);
    store.picker.setTimeZone('America/New_York');
  }

  function fillForm(): void {
    store.updateForm({
      name: 'Jane Doe',
      email: 'jane@acme-tax.com',
      company: 'Acme Tax',
      heardAboutCode: 'google_search',
    });
  }

  function toVerify(): void {
    store.start('Hero');
    store.selectSlot(SLOT_A);
    fillForm();
    store.submit(null);
  }

  beforeEach(() => {
    api = new FakePublicBookingApi();
    sessionStorage.clear();
  });

  afterEach(() => {
    store?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('carga la página y los horarios, y elige el primer día con horarios', () => {
    setUp();
    store.start('Hero');

    expect(store.pageState()).toBe('ready');
    expect(store.picker.days().length).toBe(1);
    expect(store.picker.daySlots()).toEqual([SLOT_A, SLOT_B]);
  });

  it('una página inactiva o sin anfitriones ofrece escribirnos', () => {
    api.pageResult = () => of({ ...PAGE, bookingAvailable: false });
    setUp();
    store.start('Hero');

    expect(store.pageState()).toBe('unavailable');
    expect(api.slotCalls).toBe(0);
  });

  it('una página que no existe también ofrece escribirnos; sin red, reintentar', () => {
    api.pageResult = () => throwError(() => problem(404, null));
    setUp();
    store.start('Hero');
    expect(store.pageState()).toBe('unavailable');

    TestBed.resetTestingModule();
    api = new FakePublicBookingApi();
    api.pageResult = () => throwError(() => problem(0, null));
    setUp();
    store.start('Hero');
    expect(store.pageState()).toBe('error');
  });

  it('valida los datos antes de enviar, con las reglas de Calendar', () => {
    setUp();
    store.start('Hero');
    store.selectSlot(SLOT_A);
    store.updateForm({
      name: ' ',
      email: 'not-an-email',
      company: 'Acme',
      phone: '12',
      heardAboutCode: '',
    });

    store.submit(null);

    expect(api.requests.length).toBe(0);
    expect(store.fieldErrors()).toEqual({
      name: 'required',
      email: 'email',
      phone: 'phone',
      heardAbout: 'required',
    });
  });

  it('envía la solicitud con el botón de origen, la atribución, el idioma, la zona y el consentimiento', () => {
    sessionStorage.setItem(
      'tpo.demo.attribution.v1',
      JSON.stringify({
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'fall',
        referrerDomain: 'bing.com',
      }),
    );
    setUp();
    TestBed.inject(TranslationStore).setLang('es');
    toVerify();

    const sent = api.requests[0];
    expect(sent.body).toMatchObject({
      slotStartUtc: SLOT_A,
      name: 'Jane Doe',
      email: 'jane@acme-tax.com',
      company: 'Acme Tax',
      heardAboutCode: 'google_search',
      heardAboutDetail: null,
      entrySource: 'Hero',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'fall',
      referrerDomain: 'bing.com',
      language: 'Es',
      timeZone: 'America/New_York',
      marketingOptIn: false,
      consentVersion: '2026-11-demo-v1',
    });
    expect(sent.key.length).toBeGreaterThan(8);
    expect(store.step()).toBe('verify');
    expect(store.holdSecondsLeft()).toBeGreaterThan(590);
    TestBed.inject(TranslationStore).setLang('en');
  });

  it('el mismo envío repetido tras un fallo de red conserva la clave y los datos', () => {
    setUp();
    api.requestResult = () => throwError(() => problem(0, null));
    store.start('Hero');
    store.selectSlot(SLOT_A);
    fillForm();
    store.submit(null);

    expect(store.notice()).toBe('network');
    expect(store.step()).toBe('details');
    expect(store.form().email).toBe('jane@acme-tax.com');

    api.requestResult = () =>
      of({
        requestHandle: 'handle-1',
        holdExpiresAtUtc: new Date(Date.now() + 600_000).toISOString(),
      });
    store.submit(null);
    expect(api.requests[1].key).toBe(api.requests[0].key);
    expect(store.step()).toBe('verify');
  });

  it('409: el horario se ocupó, vuelve a horarios, los recarga y conserva los datos', () => {
    setUp();
    api.requestResult = () => throwError(() => problem(409, 'Calendar.PublicBooking.SlotTaken'));
    store.start('Hero');
    const loadsBefore = api.slotCalls;
    store.selectSlot(SLOT_A);
    fillForm();

    store.submit(null);

    expect(store.step()).toBe('slot');
    expect(store.notice()).toBe('slotTaken');
    expect(store.selectedSlot()).toBeNull();
    expect(api.slotCalls).toBe(loadsBefore + 1);
    expect(store.form().name).toBe('Jane Doe');

    store.selectSlot(SLOT_B);
    expect(store.step()).toBe('details');
    store.submit(null);
    expect(api.requests[1].key).not.toBe(api.requests[0].key);
  });

  it('429: bloquea el envío con la cuenta atrás del backend sin perder los datos', () => {
    setUp();
    api.requestResult = () =>
      throwError(() => problem(429, 'RateLimit.Exceeded', { 'Retry-After': '42' }));
    store.start('Hero');
    store.selectSlot(SLOT_A);
    fillForm();

    store.submit(null);
    store.submit(null);

    expect(api.requests.length).toBe(1);
    expect(store.notice()).toBe('throttled');
    expect(store.cooldown.secondsLeft()).toBe(42);
    expect(store.form().company).toBe('Acme Tax');
  });

  it('un error de un campo se muestra en ese campo', () => {
    setUp();
    api.requestResult = () => throwError(() => problem(400, 'Calendar.PublicBooking.EmailInvalid'));
    store.start('Hero');
    store.selectSlot(SLOT_A);
    fillForm();

    store.submit(null);

    expect(store.fieldErrors()).toEqual({ email: 'email' });
  });

  it('con Turnstile configurado y sin token no envía nada', () => {
    api.pageResult = () => of({ ...PAGE, turnstileSiteKey: 'site-key' });
    setUp();
    store.start('Hero');
    store.selectSlot(SLOT_A);
    fillForm();

    store.submit(null);

    expect(api.requests.length).toBe(0);
    expect(store.notice()).toBe('botCheck');
  });

  it('un código equivocado se marca en el campo; el correcto confirma', () => {
    setUp();
    toVerify();
    api.verifyResult = () => throwError(() => problem(400, 'Calendar.PublicBooking.InvalidCode'));

    store.verify('111111');
    expect(store.fieldErrors()).toEqual({ code: 'invalidCode' });
    expect(store.step()).toBe('verify');

    api.verifyResult = () => of(CONFIRMED);
    store.verify('482 913');
    expect(api.verifies.at(-1)).toEqual({ handle: 'handle-1', code: '482913' });
    expect(store.step()).toBe('confirmed');
    expect(store.confirmation()).toEqual(CONFIRMED);
  });

  it('reenviar el código respeta su espera', () => {
    setUp();
    toVerify();

    store.resend();
    expect(api.resends).toBe(0);

    store.resendCooldown.stop();
    store.resend();
    expect(api.resends).toBe(1);
    expect(store.notice()).toBe('resent');
    expect(store.resendCooldown.active()).toBe(true);
  });

  it('la retención vencida vuelve a elegir horario con los datos intactos', () => {
    setUp();
    toVerify();

    store.tick(Date.now() + 601_000);

    expect(store.step()).toBe('slot');
    expect(store.notice()).toBe('holdExpired');
    expect(store.form().email).toBe('jane@acme-tax.com');
  });

  it('410 al verificar (retención vencida o demasiados intentos) también vuelve a elegir', () => {
    setUp();
    toVerify();
    api.verifyResult = () =>
      throwError(() => problem(410, 'Calendar.PublicBooking.TooManyAttempts'));

    store.verify('123456');

    expect(store.step()).toBe('slot');
    expect(store.notice()).toBe('holdExpired');
  });

  it('el horario se ocupó al verificar: se elige otro y se confirma sin repetir el código', () => {
    setUp();
    toVerify();
    api.verifyResult = () => throwError(() => problem(409, 'Calendar.PublicBooking.SlotTaken'));
    store.verify('482913');

    expect(store.step()).toBe('slot');
    expect(store.notice()).toBe('pickAnother');

    api.verifyResult = () => of({ ...CONFIRMED, startUtc: SLOT_B });
    store.selectSlot(SLOT_B);

    expect(api.chosen).toEqual([SLOT_B]);
    expect(api.verifies.at(-1)).toEqual({ handle: 'handle-1', code: '482913' });
    expect(store.step()).toBe('confirmed');
  });

  it('una página sin verificación confirma al enviar', () => {
    api.pageResult = () => of({ ...PAGE, requiresVerification: false });
    setUp();
    toVerify();

    expect(api.verifies).toEqual([{ handle: 'handle-1', code: '' }]);
    expect(store.step()).toBe('confirmed');
  });

  it('mientras confirma no acepta un segundo envío', () => {
    setUp();
    const pending = new Subject<unknown>();
    api.requestResult = () => pending;
    store.start('Hero');
    store.selectSlot(SLOT_A);
    fillForm();

    store.submit(null);
    store.submit(null);

    expect(api.requests.length).toBe(1);
    expect(store.busy()).toBe(true);
  });
});
