import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { resetPlatformRuntimeForTests } from '@core/config/platform-runtime';
import { PublicBookingApi } from '@core/public-booking/public-booking.api';
import { DemoBookingService } from '@landing/demo-booking.service';
import { BOT_WIDGET_FACTORY } from './booking-details.component';
import { BookingFlowComponent } from './booking-flow.component';
import { FakePublicBookingApi, PAGE } from './public-booking.testing';

/** La experiencia de reserva de DEMO-11: contexto a la izquierda, pasos a la derecha. */
describe('BookingFlowComponent', () => {
  let api: FakePublicBookingApi;

  function render() {
    TestBed.configureTestingModule({
      imports: [BookingFlowComponent],
      providers: [
        provideRouter([]),
        { provide: PublicBookingApi, useValue: api },
        {
          provide: BOT_WIDGET_FACTORY,
          useValue: () => ({
            mount: async () => undefined,
            next: async () => 'bot-token',
            reset: () => undefined,
            destroy: () => undefined,
          }),
        },
      ],
    });
    const fixture = TestBed.createComponent(BookingFlowComponent);
    fixture.componentRef.setInput('source', 'Faq');
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    return fixture;
  }

  const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

  function el(fixture: { nativeElement: HTMLElement }): HTMLElement {
    return fixture.nativeElement;
  }

  function pickFirstTime(fixture: { nativeElement: HTMLElement; detectChanges(): void }): void {
    (
      el(fixture).querySelector('[data-testid="next-available"] button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
  }

  function type(
    root: HTMLElement,
    selector: string,
    value: string,
    events = ['input', 'blur'],
  ): void {
    const input = root.querySelector(selector) as HTMLInputElement;
    input.value = value;
    for (const event of events) {
      input.dispatchEvent(new Event(event));
    }
  }

  beforeEach(() => {
    api = new FakePublicBookingApi();
    resetPlatformRuntimeForTests('www.taxoffix.io');
  });
  afterEach(() => {
    document.querySelectorAll('app-booking-flow, [ng-version]').forEach((node) => node.remove());
    TestBed.resetTestingModule();
  });

  it('sin reservas en línea ofrece escribir al soporte de la plataforma', () => {
    api.pageResult = () => of({ ...PAGE, bookingAvailable: false });
    const fixture = render();
    const box = el(fixture).querySelector('[data-testid="demo-unavailable"]') as HTMLElement;

    expect(box.textContent).toContain(
      "Online booking isn't available right now. Email us at support@taxoffix.io",
    );
    expect(box.querySelector('a')?.getAttribute('href')).toBe('mailto:support@taxoffix.io');
  });

  it('antes de pedir nada cuenta qué es, con quién y qué se va a ver', () => {
    const fixture = render();
    const context = el(fixture).querySelector('[data-testid="demo-context"]') as HTMLElement;
    const text = squash(context.textContent);

    expect(text).toContain('Book a live demo');
    expect(text).toContain('Free');
    expect(text).toContain('30 min');
    expect(text).toContain('Live video call');
    expect(text).toContain('With María Pérez or Ben Cole');
    expect(text).toContain('Your office in one place');
    expect(
      squash(el(fixture).querySelector('[data-testid="demo-summary"]')?.textContent),
    ).toContain('Pick a time');
    expect(squash(el(fixture).textContent)).toContain('Step 1 of 3');
  });

  it('"Next available" reserva a un clic y el resumen lo refleja', () => {
    const fixture = render();
    const quick = [...el(fixture).querySelectorAll('[data-testid="next-available"] button')];
    expect(quick.length).toBe(2);

    pickFirstTime(fixture);

    expect(squash(el(fixture).textContent)).toContain('Step 2 of 3');
    expect(
      squash(el(fixture).querySelector('[data-testid="demo-summary"]')?.textContent),
    ).not.toContain('Pick a time');
  });

  it('los datos van en una columna y lo opcional queda plegado', () => {
    const fixture = render();
    pickFirstTime(fixture);
    const root = el(fixture);

    const optional = root.querySelector(
      'details[data-testid="optional-details"]',
    ) as HTMLDetailsElement;
    expect(optional).toBeTruthy();
    expect(optional.open).toBe(false);
    expect(optional.querySelector('[name="phone"]')).toBeTruthy();
    expect(optional.querySelector('[name="officeSize"]')).toBeTruthy();
    expect(optional.querySelector('[name="interest"]')).toBeTruthy();
    expect(optional.querySelector('[name="email"]')).toBeNull();
    expect(
      [...root.querySelectorAll('select[name="heardAbout"] option')].map((o) =>
        o.textContent?.trim(),
      ),
    ).toEqual(['Choose an option', 'Google search', 'Other']);
    const privacy = root.querySelector('a[href="/privacy"]');
    expect(squash(privacy?.parentElement?.textContent)).toMatch(/See our Privacy Policy\.$/);
    expect(squash(root.textContent)).toMatch(/Your time: \S/);
  });

  it('valida cada campo al salir de él y marca los correctos', () => {
    const fixture = render();
    pickFirstTime(fixture);
    const root = el(fixture);

    type(root, 'input[name="email"]', 'not-an-email');
    fixture.detectChanges();
    expect(root.querySelector('#demo-email-error')?.textContent).toContain('Enter a valid email.');

    type(root, 'input[name="email"]', 'jane@acme-tax.com');
    fixture.detectChanges();
    expect(root.querySelector('#demo-email-error')).toBeNull();
    expect(root.querySelector('[data-field="email"]')?.getAttribute('data-valid')).toBe('true');
  });

  it('sugiere el dominio cuando el email parece mal escrito', () => {
    const fixture = render();
    pickFirstTime(fixture);
    const root = el(fixture);

    type(root, 'input[name="email"]', 'jane@gmial.com');
    fixture.detectChanges();
    const suggestion = root.querySelector(
      '[data-testid="email-suggestion"] button',
    ) as HTMLButtonElement;
    expect(suggestion.textContent?.trim()).toBe('jane@gmail.com');

    suggestion.click();
    fixture.detectChanges();
    expect((root.querySelector('input[name="email"]') as HTMLInputElement).value).toBe(
      'jane@gmail.com',
    );
    expect(root.querySelector('[data-testid="email-suggestion"]')).toBeNull();
  });

  it('"Other" pide el detalle y al enviar incompleto marca los campos', async () => {
    const fixture = render();
    pickFirstTime(fixture);
    const root = el(fixture);
    type(root, 'select[name="heardAbout"]', 'other', ['change']);
    fixture.detectChanges();
    expect(root.querySelector('input[name="heardAboutDetail"]')).toBeTruthy();

    (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    const name = root.querySelector('input[name="name"]') as HTMLInputElement;
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector(`#${name.getAttribute('aria-describedby')}`)?.textContent).toContain(
      'This field is required.',
    );
    expect(api.requests.length).toBe(0);
  });

  it('un aviso recibe el foco para que no quede escondido arriba', async () => {
    api.requestResult = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { code: 'Calendar.PublicBooking.SlotTaken' },
          }),
      );
    const fixture = render();
    pickFirstTime(fixture);
    const root = el(fixture);
    type(root, 'input[name="name"]', 'Jane Doe');
    type(root, 'input[name="email"]', 'jane@acme-tax.com');
    type(root, 'input[name="company"]', 'Acme Tax');
    type(root, 'select[name="heardAbout"]', 'google_search', ['change']);
    fixture.detectChanges();

    (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const notice = root.querySelector('[data-testid="demo-notice"]') as HTMLElement;
    expect(notice.textContent).toContain('That time was just booked.');
    expect(document.activeElement).toBe(notice);
  });

  it('avisa al contenedor cuando hay algo que se perdería al salir', () => {
    const fixture = render();
    const booking = TestBed.inject(DemoBookingService);
    expect(booking.hasProgress()).toBe(false);

    pickFirstTime(fixture);
    TestBed.tick();

    expect(booking.hasProgress()).toBe(true);
  });

  it('de punta a punta: datos, código en 6 casillas pegado de una vez y confirmación', async () => {
    api.pageResult = () => of({ ...PAGE, turnstileSiteKey: 'site-key' });
    const fixture = render();
    pickFirstTime(fixture);
    const root = el(fixture);
    type(root, 'input[name="name"]', 'Jane Doe');
    type(root, 'input[name="email"]', 'jane@acme-tax.com');
    type(root, 'input[name="company"]', 'Acme Tax');
    type(root, 'select[name="heardAbout"]', 'google_search', ['change']);
    fixture.detectChanges();

    (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.requests[0].body.botToken).toBe('bot-token');
    expect(api.requests[0].body.entrySource).toBe('Faq');
    expect(squash(root.textContent)).toContain('Step 3 of 3');
    expect(squash(root.textContent)).toContain('We sent a 6-digit code to jane@acme-tax.com.');
    const boxes = [...root.querySelectorAll<HTMLInputElement>('input[data-otp]')];
    expect(boxes.length).toBe(6);
    expect(boxes[0].getAttribute('autocomplete')).toBe('one-time-code');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Digit 1 of 6',
      'Digit 2 of 6',
      'Digit 3 of 6',
      'Digit 4 of 6',
      'Digit 5 of 6',
      'Digit 6 of 6',
    ]);

    const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
      clipboardData: unknown;
    };
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'Code: 482 913' } });
    boxes[0].dispatchEvent(paste);
    fixture.detectChanges();

    expect(api.verifies.at(-1)).toEqual({ handle: 'handle-1', code: '482913' });
    const text = squash(root.textContent);
    expect(text).toContain("You're all set, Jane!");
    expect(text).toContain('María Pérez');
    expect(text).toContain('Add to calendar');
    expect(text).toContain('Get the most out of 30 minutes');
    const labels = [...root.querySelectorAll('a, button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(
      expect.arrayContaining(['Google Calendar', 'Outlook', 'Apple (.ics)', 'Join link']),
    );
  });
});
