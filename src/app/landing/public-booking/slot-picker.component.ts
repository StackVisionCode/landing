import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import {
  formatDay,
  formatDayShort,
  formatTime,
  gmtOffset,
  supportedZones,
  zoneLabel,
} from '@core/public-booking/slot-calendar';

export interface PickerDay {
  readonly key: string;
  readonly date: Date;
  readonly slots: readonly string[];
}

/** Días por fila: una semana hábil. */
const ROW = 5;

/**
 * "Next available", días hábiles y horarios en Mañana/Tarde, en la zona del visitante (DEMO-11). Días con
 * flechas del teclado (`role="grid"`), horarios como `radiogroup`. No sabe de la API: la usan la reserva y
 * la gestión.
 */
@Component({
  selector: 'app-slot-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './slot-picker.component.html',
})
export class SlotPickerComponent {
  readonly days = input.required<readonly PickerDay[]>();
  readonly selectedDay = input<string | null>(null);
  readonly selectedSlot = input<string | null>(null);
  readonly timeZone = input.required<string>();
  readonly quickPicks = input<readonly string[]>([]);
  readonly loading = input(false);
  readonly busy = input(false);
  readonly canGoBack = input(false);
  readonly canGoForward = input(false);

  readonly dayChange = output<string>();
  readonly slotChange = output<string>();
  readonly zoneChange = output<string>();
  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly t = inject(TranslationStore).c;
  private readonly lang = inject(TranslationStore).lang;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly editingZone = signal(false);
  protected readonly locale = computed(() => (this.lang() === 'es' ? 'es' : 'en-US'));
  protected readonly zoneName = computed(() =>
    this.t().demoBooking.zoneTime(
      zoneLabel(this.timeZone()),
      gmtOffset(this.timeZone(), this.days()[0]?.date ?? new Date()),
    ),
  );
  protected readonly zones = computed(() =>
    this.editingZone() ? supportedZones(this.timeZone()) : [],
  );
  /** Días hábiles; un fin de semana entra solo si tiene horarios (sin columnas vacías). */
  protected readonly visibleDays = computed(() =>
    this.days().filter((day) => day.slots.length > 0 || !this.isWeekend(day)),
  );
  protected readonly hasSlots = computed(() => this.days().some((day) => day.slots.length > 0));
  protected readonly rows = computed(() => {
    const days = this.visibleDays();
    const rows: PickerDay[][] = [];
    for (let i = 0; i < days.length; i += ROW) {
      rows.push(days.slice(i, i + ROW));
    }
    return rows;
  });
  protected readonly activeDay = computed(
    () => this.days().find((day) => day.key === this.selectedDay()) ?? null,
  );
  protected readonly activeDayLabel = computed(() => {
    const day = this.activeDay();
    return day ? formatDay(day.date, this.timeZone(), this.locale()) : '';
  });
  protected readonly parts = computed(() => {
    const slots = this.activeDay()?.slots ?? [];
    const morning = slots.filter((slot) => this.hourOf(slot) < 12);
    const afternoon = slots.filter((slot) => this.hourOf(slot) >= 12);
    const copy = this.t().demoBooking;
    return [
      { key: 'morning', label: copy.morning, slots: morning },
      { key: 'afternoon', label: copy.afternoon, slots: afternoon },
    ];
  });

  protected short(day: PickerDay) {
    return formatDayShort(day.date, this.timeZone(), this.locale());
  }

  protected quickDay(startUtc: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      timeZone: this.timeZone(),
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(startUtc));
  }

  protected dayAria(day: PickerDay): string {
    return this.t().demoBooking.dayLabel(
      formatDay(day.date, this.timeZone(), this.locale()),
      day.slots.length,
    );
  }

  protected time(startUtc: string): string {
    return formatTime(new Date(startUtc), this.timeZone(), this.locale());
  }

  protected pickDay(day: PickerDay): void {
    if (day.slots.length > 0) {
      this.dayChange.emit(day.key);
    }
  }

  protected changeZone(zone: string): void {
    this.editingZone.set(false);
    this.zoneChange.emit(zone);
  }

  /** Flechas: izquierda/derecha un día, arriba/abajo una fila (5 días); Inicio/Fin. */
  protected onGridKey(event: KeyboardEvent, index: number): void {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -ROW,
      ArrowDown: ROW,
    };
    const count = this.visibleDays().length;
    let target = index;
    if (event.key in steps) {
      target = index + steps[event.key];
    } else if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = count - 1;
    } else {
      return;
    }
    event.preventDefault();
    target = Math.max(0, Math.min(count - 1, target));
    this.host.nativeElement.querySelectorAll<HTMLElement>('[data-day]')[target]?.focus();
  }

  /** Flechas dentro de un grupo de horarios: se mueve como un radio nativo. */
  protected onSlotKey(event: KeyboardEvent, part: string, index: number, total: number): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0 || total === 0) {
      return;
    }
    event.preventDefault();
    const next = (index + delta + total) % total;
    this.host.nativeElement
      .querySelectorAll<HTMLElement>(`[data-part="${part}"] [data-slot]`)
      [next]?.focus();
  }

  private isWeekend(day: PickerDay): boolean {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone(),
      weekday: 'short',
    }).format(day.date);
    return weekday === 'Sat' || weekday === 'Sun';
  }

  private hourOf(startUtc: string): number {
    return Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: this.timeZone(),
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(new Date(startUtc)),
    );
  }
}
