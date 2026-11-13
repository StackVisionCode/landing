import { computed, signal } from '@angular/core';
import { browserTimeZone } from '@core/onboarding/browser-time-zone.util';
import type { PublicBookingApi } from '@core/public-booking/public-booking.api';
import {
  WINDOW_DAYS,
  groupByDay,
  isValidZone,
  windowDays,
} from '@core/public-booking/slot-calendar';

const DAY_MS = 86_400_000;

/**
 * Ventana de 14 días de horarios de una página pública, en la zona del visitante. La comparten la reserva y
 * la gestión (`/demo/manage`). Un error de red o un 429 los decide quien la usa (`onError`).
 */
export class SlotBrowser {
  readonly slug = signal<string | null>(null);
  readonly maxDaysAhead = signal(60);
  readonly timeZone = signal<string>(browserTimeZone() ?? 'UTC');
  readonly windowStart = signal<Date>(new Date());
  readonly slots = signal<readonly string[]>([]);
  readonly loading = signal(false);
  readonly selectedDay = signal<string | null>(null);
  readonly now = signal(Date.now());

  readonly days = computed(() => groupByDay(this.slots(), this.timeZone()));
  readonly calendarDays = computed(() => {
    const byKey = new Map(this.days().map((day) => [day.key, day.slots]));
    return windowDays(this.windowStart(), this.timeZone()).map((day) => ({
      ...day,
      slots: byKey.get(day.key) ?? [],
    }));
  });
  readonly daySlots = computed(
    () => this.days().find((day) => day.key === this.selectedDay())?.slots ?? [],
  );
  readonly canGoBack = computed(() => this.windowStart().getTime() > this.now() + 60_000);
  readonly canGoForward = computed(
    () =>
      this.windowStart().getTime() + WINDOW_DAYS * DAY_MS <
      this.now() + this.maxDaysAhead() * DAY_MS,
  );

  constructor(
    private readonly api: PublicBookingApi,
    private readonly onError: (err: unknown) => void,
  ) {}

  load(): void {
    const slug = this.slug();
    if (!slug) {
      return;
    }
    const from = new Date(Math.max(this.windowStart().getTime(), Date.now()));
    const to = new Date(this.windowStart().getTime() + WINDOW_DAYS * DAY_MS);
    this.loading.set(true);
    this.api.slots(slug, from, to).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.slots.set(response.slots.map((slot) => slot.startUtc));
        this.ensureDaySelected();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.slots.set([]);
        this.onError(err);
      },
    });
  }

  next(): void {
    if (this.canGoForward()) {
      this.moveTo(this.windowStart().getTime() + WINDOW_DAYS * DAY_MS);
    }
  }

  previous(): void {
    if (this.canGoBack()) {
      this.moveTo(Math.max(Date.now(), this.windowStart().getTime() - WINDOW_DAYS * DAY_MS));
    }
  }

  setTimeZone(zone: string): void {
    if (isValidZone(zone)) {
      this.timeZone.set(zone);
      this.selectedDay.set(null);
      this.ensureDaySelected();
    }
  }

  selectDay(key: string): void {
    this.selectedDay.set(key);
  }

  private moveTo(start: number): void {
    this.windowStart.set(new Date(start));
    this.selectedDay.set(null);
    this.load();
  }

  private ensureDaySelected(): void {
    const days = this.days();
    if (!days.some((day) => day.key === this.selectedDay())) {
      this.selectedDay.set(days[0]?.key ?? null);
    }
  }
}
