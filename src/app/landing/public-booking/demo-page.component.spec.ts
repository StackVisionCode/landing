import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PublicBookingApi } from '@core/public-booking/public-booking.api';
import { DemoBookingService } from '@landing/demo-booking.service';
import { DemoPageComponent, demoLeaveGuard } from './demo-page.component';
import { FakePublicBookingApi, PAGE } from './public-booking.testing';

/**
 * DEMO-11: "Book a live demo" es una página, no un modal (NN/g: evitar overlays para tareas largas). Atrás
 * funciona solo; salir con avance pregunta antes de perder el horario y los datos.
 */
describe('DemoPageComponent', () => {
  function setUp() {
    const api = new FakePublicBookingApi();
    api.pageResult = () => of({ ...PAGE, bookingAvailable: false });
    TestBed.configureTestingModule({
      imports: [DemoPageComponent],
      providers: [
        provideRouter([{ path: '', children: [] }]),
        { provide: PublicBookingApi, useValue: api },
      ],
    });
    return TestBed.inject(DemoBookingService);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('los botones del landing llevan a /demo con su origen', async () => {
    setUp();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    TestBed.inject(DemoBookingService).open('faq');

    expect(navigate).toHaveBeenCalledWith(['/demo'], { state: { demoSource: 'Faq' } });
  });

  it('sin avance se sale sin preguntar', async () => {
    const booking = setUp();
    booking.hasProgress.set(false);

    const allowed = await TestBed.runInInjectionContext(() => demoLeaveGuard());

    expect(allowed).toBe(true);
  });

  it('con avance pregunta: "Keep booking" se queda y "Leave" sale', async () => {
    const booking = setUp();
    const fixture = TestBed.createComponent(DemoPageComponent);
    fixture.detectChanges();
    booking.hasProgress.set(true);

    const first = TestBed.runInInjectionContext(() => demoLeaveGuard()) as Promise<boolean>;
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Leave without booking?');
    (
      [...dialog.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Keep booking',
      ) as HTMLButtonElement
    ).click();
    expect(await first).toBe(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();

    const second = TestBed.runInInjectionContext(() => demoLeaveGuard()) as Promise<boolean>;
    fixture.detectChanges();
    (
      [...fixture.nativeElement.querySelectorAll('[role="alertdialog"] button')].find(
        (b: Element) => b.textContent?.trim() === 'Leave',
      ) as HTMLButtonElement
    ).click();
    expect(await second).toBe(true);
    expect(booking.hasProgress()).toBe(false);
  });

  it('lleva el logo del landing (marca e "offix" en azul) que vuelve al inicio', () => {
    setUp();
    const fixture = TestBed.createComponent(DemoPageComponent);
    fixture.detectChanges();
    const home = fixture.nativeElement.querySelector('header a[href="/"]') as HTMLAnchorElement;

    expect(home.querySelector('img')?.getAttribute('src')).toBe('img/logo-mark.png');
    expect(home.textContent?.replace(/\s+/g, '')).toBe('Taxoffix');
    expect(home.querySelector('.text-star')?.textContent).toBe('offix');
  });

  it('el origen llega por el estado de la navegación', () => {
    setUp();
    history.replaceState({ demoSource: 'Team' }, '');
    const fixture = TestBed.createComponent(DemoPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance['source']).toBe('Team');
    history.replaceState(null, '');
  });
});
