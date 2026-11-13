import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { platformSupportEmail } from '@core/config/platform-runtime';
import { PLATFORM_BRAND, PLATFORM_DOMAIN } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';
import {
  type DemoEvent,
  googleCalendarUrl,
  icsBlob,
  outlookCalendarUrl,
} from '@core/public-booking/calendar-links';
import type { PublicBookingConfirmation } from '@core/public-booking/public-booking.models';
import {
  formatFullDate,
  formatTime,
  gmtOffset,
  zoneLabel,
} from '@core/public-booking/slot-calendar';

const CONFETTI_COLORS = ['#E3FF00', '#4DD8FF', '#057BC1', '#083645'];

/**
 * La demo confirmada (DEMO-11): check animado, la tarjeta con el anfitrión y la hora, "Add to calendar" como
 * acción principal y cómo aprovechar los 30 minutos. El enlace de la reunión queda como secundario: hoy no es
 * la acción del día. El confeti respeta `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-booking-confirmation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-confirmation.component.html',
})
export class BookingConfirmationComponent {
  readonly confirmation = input.required<PublicBookingConfirmation>();
  readonly title = input.required<string>();
  readonly email = input.required<string>();
  readonly timeZone = input.required<string>();
  readonly firstName = input('');

  readonly done = output<void>();

  protected readonly t = inject(TranslationStore).c;
  private readonly lang = inject(TranslationStore).lang;
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('confetti');

  protected readonly locale = computed(() => (this.lang() === 'es' ? 'es' : 'en-US'));
  protected readonly start = computed(() => new Date(this.confirmation().startUtc));
  protected readonly day = computed(() =>
    formatFullDate(this.start(), this.timeZone(), this.locale()),
  );
  protected readonly range = computed(() => {
    const end = new Date(this.start().getTime() + this.confirmation().durationMinutes * 60_000);
    return `${formatTime(this.start(), this.timeZone(), this.locale())} – ${formatTime(end, this.timeZone(), this.locale())}`;
  });
  protected readonly zone = computed(() =>
    this.t().demoBooking.zoneTime(
      zoneLabel(this.timeZone()),
      gmtOffset(this.timeZone(), this.start()),
    ),
  );
  protected readonly initials = computed(() =>
    this.confirmation()
      .hostName.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );
  protected readonly event = computed<DemoEvent>(() => {
    const c = this.confirmation();
    return {
      title: `${this.title()} · ${PLATFORM_BRAND}`,
      startUtc: c.startUtc,
      durationMinutes: c.durationMinutes,
      meetingUrl: c.meetingUrl,
      icsUid: c.icsUid,
      icsSequence: c.icsSequence,
      organizerName: c.hostName,
    };
  });
  protected readonly google = computed(() => googleCalendarUrl(this.event()));
  protected readonly outlook = computed(() => outlookCalendarUrl(this.event()));

  constructor() {
    afterNextRender(() => this.celebrate());
  }

  /** El archivo se arma al hacer clic: nada queda colgado en memoria. */
  protected downloadIcs(): void {
    const url = URL.createObjectURL(
      icsBlob(this.event(), PLATFORM_DOMAIN, PLATFORM_BRAND, platformSupportEmail()),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'demo.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** Un segundo y medio de confeti con los colores de la marca; nada si el visitante pidió menos movimiento. */
  private celebrate(): void {
    const canvas = this.canvas()?.nativeElement;
    const context = canvas?.getContext?.('2d');
    if (
      !canvas ||
      !context ||
      typeof matchMedia === 'undefined' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    const pieces = Array.from({ length: 90 }, () => ({
      x: innerWidth / 2,
      y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -12 - 4,
      size: 4 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      turn: Math.random() * 6,
    }));
    let frame = 0;
    const tick = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const piece of pieces) {
        piece.vy += 0.35;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.turn += 0.1;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.turn);
        context.fillStyle = piece.color;
        context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
        context.restore();
      }
      if (++frame < 90) {
        requestAnimationFrame(tick);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    requestAnimationFrame(tick);
  }
}
