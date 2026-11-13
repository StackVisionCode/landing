import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { PublicBookingApi } from '@core/public-booking/public-booking.api';
import type { PublicBookingManageView } from '@core/public-booking/public-booking.models';
import { ManageBookingComponent, readToken } from './manage-booking.component';

const VIEW: PublicBookingManageView = {
  status: 'Confirmed',
  startUtc: '2026-11-18T15:00:00Z',
  durationMinutes: 30,
  title: 'Book a live demo',
  hostName: 'María Pérez',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  timeZone: 'America/New_York',
  pageSlug: 'demo',
  canChange: true,
};

class FakeApi {
  viewResult: () => Observable<PublicBookingManageView> = () => of(VIEW);
  rescheduleResult: () => Observable<unknown> = () =>
    of({ booking: { ...VIEW, startUtc: '2026-11-19T15:00:00Z' }, managementToken: 'token-2' });
  cancelResult: () => Observable<unknown> = () => of({});
  readonly calls: string[] = [];

  view = (token: string) => {
    this.calls.push(`view:${token}`);
    return this.viewResult();
  };
  slots = () => of({ slots: [{ startUtc: '2026-11-19T15:00:00Z' }] });
  reschedule = (token: string, slot: string) => {
    this.calls.push(`reschedule:${token}:${slot}`);
    return this.rescheduleResult();
  };
  cancel = (token: string, reason: string | null) => {
    this.calls.push(`cancel:${token}:${reason}`);
    return this.cancelResult();
  };
}

describe('ManageBookingComponent', () => {
  let api: FakeApi;

  async function render(hash: string) {
    history.replaceState(null, '', `/demo/manage${hash}`);
    TestBed.configureTestingModule({
      imports: [ManageBookingComponent],
      providers: [provideRouter([]), { provide: PublicBookingApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(ManageBookingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? '';
  }

  function click(
    fixture: { nativeElement: HTMLElement; detectChanges(): void },
    label: string,
  ): void {
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    );
    expect(button, label).toBeTruthy();
    button!.click();
    fixture.detectChanges();
  }

  beforeEach(() => (api = new FakeApi()));
  afterEach(() => {
    TestBed.resetTestingModule();
    history.replaceState(null, '', '/');
  });

  it('lleva el logo del landing', async () => {
    const fixture = await render('');
    const home = fixture.nativeElement.querySelector('header a[href="/"]') as HTMLAnchorElement;

    expect(home.querySelector('img')?.getAttribute('src')).toBe('img/logo-mark.png');
    expect(home.textContent?.replace(/\s+/g, '')).toBe('Taxoffix');
  });

  it('lee el token del fragmento, no de la query', () => {
    expect(readToken('#token=abc%2B1')).toBe('abc+1');
    expect(readToken('')).toBeNull();
  });

  it('sin token o con un enlace inválido dice que ya no es válido, igual en los dos casos', async () => {
    const empty = await render('');
    expect(text(empty)).toContain('This link is no longer valid.');
    TestBed.resetTestingModule();

    api.viewResult = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { code: 'Calendar.PublicBooking.NotFound' },
          }),
      );
    const used = await render('#token=old');
    expect(text(used)).toContain('This link is no longer valid.');
    expect(api.calls).toEqual(['view:old']);
  });

  it('muestra la demo en la zona del visitante', async () => {
    const fixture = await render('#token=token-1');

    expect(text(fixture)).toContain('Confirmed');
    expect(text(fixture)).toContain('Wednesday, November 18, 2026');
    expect(text(fixture)).toContain('10:00');
    expect(text(fixture)).toContain('New York');
    expect(text(fixture)).toContain('With María Pérez');
  });

  it('cancelar manda el motivo y deja la demo cancelada', async () => {
    const fixture = await render('#token=token-1');

    click(fixture, 'Cancel the demo');
    const reason = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'Found another tool';
    reason.dispatchEvent(new Event('input'));
    click(fixture, 'Yes, cancel it');

    expect(api.calls.at(-1)).toBe('cancel:token-1:Found another tool');
    expect(text(fixture)).toContain('Your demo was canceled.');
    expect(text(fixture)).not.toContain('Reschedule');
  });

  it('cambiar de horario usa el enlace nuevo y lo deja en la barra', async () => {
    const fixture = await render('#token=token-1');

    click(fixture, 'Reschedule');
    const slot = fixture.nativeElement.querySelector('[role="radio"]') as HTMLButtonElement;
    slot.click();
    fixture.detectChanges();
    click(fixture, 'Confirm the change');

    expect(api.calls.at(-1)).toBe('reschedule:token-1:2026-11-19T15:00:00Z');
    expect(location.hash).toBe('#token=token-2');
    expect(text(fixture)).toContain('Done, we moved your demo.');
    expect(text(fixture)).toContain('Thursday, November 19, 2026');
  });

  it('si el horario se ocupó, lo dice y recarga los horarios', async () => {
    api.rescheduleResult = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { code: 'Calendar.PublicBooking.SlotTaken' },
          }),
      );
    const fixture = await render('#token=token-1');

    click(fixture, 'Reschedule');
    (fixture.nativeElement.querySelector('[role="radio"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    click(fixture, 'Confirm the change');

    expect(text(fixture)).toContain('That time was just booked.');
  });
});
