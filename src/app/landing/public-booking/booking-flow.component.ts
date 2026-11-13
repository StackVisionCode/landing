import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { platformSupportEmail } from '@core/config/platform-runtime';
import { formatClock } from '@core/http/throttling';
import { TranslationStore } from '@core/i18n/translation.store';
import type { BookingEntrySource } from '@core/public-booking/public-booking.models';
import { DemoBookingService } from '@landing/demo-booking.service';
import {
  formatFullDate,
  formatTime,
  gmtOffset,
  zoneLabel,
} from '@core/public-booking/slot-calendar';
import { BookingConfirmationComponent } from './booking-confirmation.component';
import { BookingDetailsComponent } from './booking-details.component';
import { BookingFlowStore } from './booking-flow.store';
import { SlotPickerComponent } from './slot-picker.component';
import { VerifyCodeComponent } from './verify-code.component';

/**
 * "Book a live demo" en tres pasos, en dos paneles (DEMO-11): a la izquierda qué es, con quién y qué se va a
 * ver, más un resumen que se arma al elegir; a la derecha los pasos. `source` es el botón que la abrió
 * (atribución). Lee el reloj solo en el navegador: el prerender no ve la hora.
 */
@Component({
  selector: 'app-booking-flow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SlotPickerComponent,
    BookingDetailsComponent,
    VerifyCodeComponent,
    BookingConfirmationComponent,
  ],
  providers: [BookingFlowStore],
  templateUrl: './booking-flow.component.html',
})
export class BookingFlowComponent implements OnInit {
  readonly source = input<BookingEntrySource>('Direct');
  readonly done = output<void>();

  protected readonly store = inject(BookingFlowStore);
  private readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.c;
  protected readonly supportEmail = platformSupportEmail();
  protected readonly clock = formatClock;

  protected readonly stepNumber = computed(
    () => ({ slot: 1, details: 2, verify: 3, confirmed: 3 })[this.store.step()],
  );
  protected readonly totalSteps = computed(() =>
    this.store.page()?.requiresVerification === false ? 2 : 3,
  );
  protected readonly stepTitle = computed(() => {
    const steps = this.t().demoBooking.steps;
    return { slot: steps.slot, details: steps.details, verify: steps.verify, confirmed: '' }[
      this.store.step()
    ];
  });
  protected readonly slotLabel = computed(() => {
    const slot = this.store.selectedSlot();
    if (!slot) {
      return '';
    }
    const locale = this.translation.lang() === 'es' ? 'es' : 'en-US';
    const date = new Date(slot);
    const zone = this.store.picker.timeZone();
    return `${formatFullDate(date, zone, locale)} · ${formatTime(date, zone, locale)} (${this.t().demoBooking.zoneTime(zoneLabel(zone), gmtOffset(zone, date))})`;
  });
  /** Primeros nombres de los anfitriones: "With María or Ben". */
  protected readonly hostsLine = computed(() => {
    const names = (this.store.page()?.hosts ?? []).map((host) => host.displayName);
    return names.length > 0 ? this.t().demoBooking.hostsLine(names) : '';
  });
  protected readonly hostInitials = computed(() =>
    (this.store.page()?.hosts ?? []).slice(0, 3).map((host) =>
      host.displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join(''),
    ),
  );
  protected readonly summaryWhen = computed(() => {
    const slot = this.store.confirmation()?.startUtc ?? this.store.selectedSlot();
    if (!slot) {
      return this.t().demoBooking.pickATime;
    }
    const locale = this.translation.lang() === 'es' ? 'es' : 'en-US';
    const zone = this.store.picker.timeZone();
    const date = new Date(slot);
    const day = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
    return `${day} · ${formatTime(date, zone, locale)}`;
  });
  protected readonly summaryZone = computed(() => {
    const zone = this.store.picker.timeZone();
    const at = this.store.selectedSlot() ? new Date(this.store.selectedSlot()!) : new Date();
    return this.t().demoBooking.zoneTime(zoneLabel(zone), gmtOffset(zone, at));
  });
  protected readonly summaryWith = computed(
    () => this.store.confirmation()?.hostName ?? this.t().demoBooking.firstAvailable,
  );
  protected readonly noticeText = computed(() => {
    const errors = this.t().demoBooking.errors;
    switch (this.store.notice()) {
      case 'slotTaken':
        return errors.slotTaken;
      case 'pickAnother':
        return `${errors.slotTaken} ${this.t().demoBooking.verify.pickAnother}`;
      case 'holdExpired':
        return errors.holdExpired;
      case 'network':
        return errors.network;
      case 'throttled':
        return errors.throttled(formatClock(this.store.cooldown.secondsLeft()));
      case 'consentOutdated':
        return errors.consentOutdated;
      case 'botCheck':
        return errors.botCheck;
      case 'text':
        return errors.text;
      case 'generic':
        return errors.generic;
      case 'resent':
        return this.t().demoBooking.verify.resent;
      default:
        return null;
    }
  });

  private readonly noticeRef = viewChild<ElementRef<HTMLElement>>('notice');

  constructor() {
    afterNextRender(() => this.store.startClock());
    // Un aviso de error toma el foco: si no, queda arriba, fuera de la vista.
    afterRenderEffect(() => {
      const el = this.noticeRef()?.nativeElement;
      const notice = this.store.notice();
      if (el && notice && notice !== 'resent') {
        el.focus();
        el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }
    });
    // El contenedor (modal o /demo) pregunta antes de salir si hay algo que se perdería.
    const booking = inject(DemoBookingService);
    effect(() => booking.hasProgress.set(this.store.hasProgress()));
    // El título, la descripción y las opciones vienen traducidos de la página: al cambiar de idioma se piden de nuevo.
    let first = true;
    effect(() => {
      this.translation.lang();
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.store.loadPage());
    });
  }

  ngOnInit(): void {
    this.store.start(this.source());
  }

  protected retry(): void {
    if (this.store.pageState() !== 'ready') {
      this.store.loadPage();
    } else {
      this.store.loadSlots();
    }
  }
}
