import { TestBed } from '@angular/core/testing';
import { windowDays } from '@core/public-booking/slot-calendar';
import { SlotPickerComponent, type PickerDay } from './slot-picker.component';

const ZONE = 'America/New_York';
const START = new Date('2026-11-16T14:00:00Z');
const SLOTS: Record<string, string[]> = {
  '2026-11-17': ['2026-11-17T15:00:00Z', '2026-11-17T16:00:00Z'],
  '2026-11-18': ['2026-11-18T15:00:00Z'],
};

function days(): PickerDay[] {
  return windowDays(START, ZONE).map((day) => ({ ...day, slots: SLOTS[day.key] ?? [] }));
}

describe('SlotPickerComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render(selectedDay: string | null = '2026-11-17', zone = ZONE) {
    const fixture = TestBed.createComponent(SlotPickerComponent);
    fixture.componentRef.setInput('days', days());
    fixture.componentRef.setInput('timeZone', zone);
    fixture.componentRef.setInput('selectedDay', selectedDay);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    return fixture;
  }

  it('la rejilla es un grid de días hábiles: cada día dice su fecha y cuántos horarios tiene', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('Available days');
    expect(el.querySelectorAll('[role="row"]').length).toBe(2);
    const labels = [...el.querySelectorAll('[data-day]')].map((d) => d.getAttribute('aria-label'));
    expect(labels.length).toBe(10);
    expect(labels).toContain('Tuesday, November 17, 2 times');
    expect(labels).toContain('Wednesday, November 18, 1 time');
    expect(labels).toContain('Monday, November 16, no times');
    // Un fin de semana sin horarios no ocupa lugar.
    expect(
      labels.some((label) => label?.startsWith('Saturday') || label?.startsWith('Sunday')),
    ).toBe(false);
    fixture.nativeElement.remove();
  });

  it('un fin de semana con horarios sí aparece', () => {
    const fixture = TestBed.createComponent(SlotPickerComponent);
    fixture.componentRef.setInput(
      'days',
      windowDays(START, ZONE).map((day) => ({
        ...day,
        slots: day.key === '2026-11-21' ? ['2026-11-21T15:00:00Z'] : [],
      })),
    );
    fixture.componentRef.setInput('timeZone', ZONE);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-day]')].map(
      (d) => d.getAttribute('aria-label'),
    );

    expect(labels).toContain('Saturday, November 21, 1 time');
  });

  it('"Next available" ofrece los primeros horarios a un clic', () => {
    const fixture = render();
    fixture.componentRef.setInput('quickPicks', ['2026-11-17T15:00:00Z', '2026-11-17T16:00:00Z']);
    fixture.detectChanges();
    const emitted: string[] = [];
    fixture.componentInstance.slotChange.subscribe((slot) => emitted.push(slot));
    const quick = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '[data-testid="next-available"] button',
      ),
    ];

    expect(quick.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Tue, Nov 17 10:00 AM',
      'Tue, Nov 17 11:00 AM',
    ]);
    quick[1].click();
    expect(emitted).toEqual(['2026-11-17T16:00:00Z']);
    fixture.nativeElement.remove();
  });

  it('dice la zona con su desfase: la ciudad sola confunde a otro país con la misma hora', () => {
    const fixture = render();

    expect(fixture.nativeElement.textContent).toContain('Times shown in New York time, GMT-5');
    fixture.nativeElement.remove();
  });

  it('los horarios del día son radios dentro de un radiogroup, en la hora local', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const radios = [...el.querySelectorAll('[role="radiogroup"] [role="radio"]')];

    expect(radios.map((r) => r.textContent?.trim())).toEqual(['10:00 AM', '11:00 AM']);
    expect(el.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(el.textContent).toContain('Morning');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false']);
    fixture.nativeElement.remove();
  });

  it('otra zona muestra la hora convertida', () => {
    const fixture = render('2026-11-17', 'Europe/Madrid');
    const radios = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="radio"]')];

    expect(radios.map((r) => r.textContent?.trim())).toEqual(['4:00 PM', '5:00 PM']);
    // Las 4 y las 5 de la tarde caen en "Afternoon".
    const afternoon = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="radiogroup"]'),
    ].find((group) => group.getAttribute('data-part') === 'afternoon');
    expect(afternoon?.querySelectorAll('[role="radio"]').length).toBe(2);
    fixture.nativeElement.remove();
  });

  it('las flechas mueven el foco entre días y elegir un día sin horarios no hace nada', () => {
    const fixture = render();
    const emitted: string[] = [];
    fixture.componentInstance.dayChange.subscribe((key) => emitted.push(key));
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-day]'),
    ];

    buttons[1].focus();
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(buttons[2]);
    // Abajo baja una fila: 5 días hábiles.
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(buttons[7]);

    buttons[0].click();
    buttons[2].click();
    expect(emitted).toEqual(['2026-11-18']);
    fixture.nativeElement.remove();
  });

  it('sin horarios en la ventana lo dice y ofrece las semanas siguientes', () => {
    const fixture = TestBed.createComponent(SlotPickerComponent);
    fixture.componentRef.setInput(
      'days',
      windowDays(START, ZONE).map((day) => ({ ...day, slots: [] })),
    );
    fixture.componentRef.setInput('timeZone', ZONE);
    fixture.componentRef.setInput('canGoForward', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No times available in these dates.');
    expect(fixture.nativeElement.textContent).toContain('See the next weeks');
  });
});
