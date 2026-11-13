import { TranslationStore } from '@core/i18n/translation.store';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { resetPlatformRuntimeForTests } from '@core/config/platform-runtime';
import {
  BOT_WIDGET_FACTORY,
  BookingDetailsComponent,
  type BotWidget,
} from './booking-details.component';
import { EMPTY_FORM } from './booking-flow.store';
import { PAGE } from './public-booking.testing';

/** Un widget anti-bot controlable: cada `next()` devuelve lo que la prueba le da. */
class FakeBot implements BotWidget {
  mounts = 0;
  resets = 0;
  mountFails = false;
  tokens: (string | null)[] = [];
  private pending: ((token: string | null) => void) | null = null;

  language: string | undefined;

  async mount(_container: HTMLElement, _siteKey: string, language?: string): Promise<void> {
    this.mounts++;
    this.language = language;
    if (this.mountFails) {
      throw new Error('turnstile');
    }
  }

  next(): Promise<string | null> {
    if (this.tokens.length > 0) {
      return Promise.resolve(this.tokens.shift()!);
    }
    return new Promise((resolve) => (this.pending = resolve));
  }

  give(token: string | null): void {
    if (!this.pending) {
      this.tokens.push(token);
      return;
    }
    this.pending(token);
    this.pending = null;
  }

  reset(): void {
    this.resets++;
  }

  destroy(): void {}
}

/**
 * La verificación de Turnstile se ve y no deja al visitante sin salida (E-17): el botón dice "Sending…" mientras
 * espera, reintenta una vez sola y, si no hay forma, avisa junto al botón con "Try again" y el email de soporte.
 */
describe('BookingDetailsComponent', () => {
  let bot: FakeBot;

  async function render() {
    TestBed.configureTestingModule({
      imports: [BookingDetailsComponent],
      providers: [provideRouter([]), { provide: BOT_WIDGET_FACTORY, useValue: () => bot }],
    });
    const fixture = TestBed.createComponent(BookingDetailsComponent);
    fixture.componentRef.setInput('page', { ...PAGE, turnstileSiteKey: 'site-key' });
    fixture.componentRef.setInput('form', {
      ...EMPTY_FORM,
      name: 'Jane Doe',
      email: 'jane@acme-tax.com',
      company: 'Acme Tax',
      heardAboutCode: 'google_search',
    });
    fixture.componentRef.setInput('errors', {});
    fixture.componentRef.setInput('slotLabel', 'Friday, November 13 · 9:00 AM');
    const emitted: (string | null)[] = [];
    fixture.componentInstance.submitted.subscribe((token) => emitted.push(token));
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, emitted };
  }

  function submitButton(el: HTMLElement): HTMLButtonElement {
    return el.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  async function submit(fixture: { nativeElement: HTMLElement; detectChanges(): void }) {
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();
  }

  /** Sin zone.js, `whenStable` no espera la cadena de promesas del envío. */
  async function flush(fixture: { detectChanges(): void }) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  beforeEach(() => {
    bot = new FakeBot();
    resetPlatformRuntimeForTests('www.taxoffix.io');
  });
  afterEach(() => TestBed.resetTestingModule());

  it('mientras se comprueba la seguridad el botón dice "Sending…" y no se puede volver a tocar', async () => {
    const { fixture, emitted } = await render();

    await submit(fixture);

    expect(submitButton(fixture.nativeElement).textContent?.trim()).toBe('Sending…');
    expect(submitButton(fixture.nativeElement).disabled).toBe(true);

    bot.give('bot-token');
    await flush(fixture);
    expect(emitted).toEqual(['bot-token']);
    expect(submitButton(fixture.nativeElement).textContent?.trim()).toBe('Confirm my demo');
  });

  it('sin token la primera vez, reintenta una vez sola', async () => {
    bot.tokens = [null, 'second-token'];
    const { fixture, emitted } = await render();

    await submit(fixture);
    await flush(fixture);

    expect(bot.resets).toBeGreaterThanOrEqual(1);
    expect(emitted).toEqual(['second-token']);
  });

  it('si no hay forma, avisa junto al botón con "Try again" y el email, sin enviar nada', async () => {
    bot.tokens = [null, null];
    const { fixture, emitted } = await render();

    await submit(fixture);
    await flush(fixture);
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    const alert = fixture.nativeElement.querySelector('[data-testid="bot-problem"]') as HTMLElement;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain("We couldn't load the security check");
    expect(alert.textContent).toContain('support@taxoffix.io');
  });

  it('si el script no cargó, "Try again" lo vuelve a montar', async () => {
    bot.mountFails = true;
    const { fixture, emitted } = await render();

    await submit(fixture);
    await flush(fixture);
    fixture.detectChanges();
    expect(emitted).toEqual([]);
    const retry = [
      ...fixture.nativeElement.querySelectorAll('[data-testid="bot-problem"] button'),
    ].find((b: Element) => b.textContent?.trim() === 'Try again') as HTMLButtonElement;

    bot.mountFails = false;
    retry.click();
    await flush(fixture);

    expect(bot.mounts).toBe(2);
    expect(fixture.nativeElement.querySelector('[data-testid="bot-problem"]')).toBeNull();
  });

  it('el checkbox va visible antes del botón, con su espacio reservado y en el idioma de la página', async () => {
    const { fixture } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const check = root.querySelector<HTMLElement>('[data-testid="bot-check"]')!;
    expect(check).toBeTruthy();
    // Reserva el alto del widget: el botón no salta cuando aparece.
    expect(check.className).toContain('min-h-[65px]');
    expect(check.className).toContain('w-full');
    const next = check.nextElementSibling?.querySelector('button[type="submit"]');
    expect(next).toBeTruthy();
    expect(bot.language).toBe(TestBed.inject(TranslationStore).lang());
  });
});

