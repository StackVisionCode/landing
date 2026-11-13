import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PLATFORM_BRAND } from '@core/config/site-config';
import { ActionCooldown } from '@core/http/action-cooldown';
import { apiErrorCode } from '@core/http/api-error';
import { formatClock, readThrottle } from '@core/http/throttling';
import { TranslationStore } from '@core/i18n/translation.store';
import { PublicBookingApi } from '@core/public-booking/public-booking.api';
import {
  PUBLIC_BOOKING_ERRORS as E,
  type PublicBookingManageView,
} from '@core/public-booking/public-booking.models';
import {
  formatFullDate,
  formatTime,
  isValidZone,
  gmtOffset,
  zoneLabel,
} from '@core/public-booking/slot-calendar';
import { SlotBrowser } from './slot-browser';
import { SlotPickerComponent } from './slot-picker.component';

type ManageState = 'loading' | 'ready' | 'invalid' | 'error';
type ManageMode = 'view' | 'reschedule' | 'cancel';
type ManageNotice =
  'rescheduled' | 'cancelled' | 'slotTaken' | 'cannotChange' | 'throttled' | 'network' | 'generic';

const MAX_REASON = 500;

/**
 * `/demo/manage#token=…`: el visitante ve, cambia o cancela su demo con el enlace del correo. El token va en el
 * fragmento (no llega al servidor ni a los logs) y viaja a la API en el cuerpo. Un enlace inválido o ya usado
 * responde siempre igual.
 */
@Component({
  selector: 'app-manage-booking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SlotPickerComponent],
  templateUrl: './manage-booking.component.html',
})
export class ManageBookingComponent implements OnDestroy {
  private readonly api = inject(PublicBookingApi);
  private readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.c;
  protected readonly brand = PLATFORM_BRAND;
  protected readonly maxReason = MAX_REASON;

  protected readonly state = signal<ManageState>('loading');
  protected readonly mode = signal<ManageMode>('view');
  protected readonly view = signal<PublicBookingManageView | null>(null);
  protected readonly notice = signal<ManageNotice | null>(null);
  protected readonly busy = signal(false);
  protected readonly reason = signal('');
  protected readonly selectedSlot = signal<string | null>(null);
  protected readonly cooldown = new ActionCooldown();
  protected readonly picker = new SlotBrowser(this.api, (err) => this.fail(err));

  private token: string | null = null;

  protected readonly locale = computed(() => (this.translation.lang() === 'es' ? 'es' : 'en-US'));
  protected readonly when = computed(() => {
    const view = this.view();
    if (!view) {
      return '';
    }
    const zone = this.picker.timeZone();
    const start = new Date(view.startUtc);
    return `${formatFullDate(start, zone, this.locale())} · ${formatTime(start, zone, this.locale())} (${this.t().demoBooking.zoneTime(zoneLabel(zone), gmtOffset(zone, start))})`;
  });
  protected readonly newWhen = computed(() => {
    const slot = this.selectedSlot();
    if (!slot) {
      return '';
    }
    const zone = this.picker.timeZone();
    return `${formatFullDate(new Date(slot), zone, this.locale())} · ${formatTime(new Date(slot), zone, this.locale())}`;
  });
  protected readonly initials = computed(() =>
    (this.view()?.hostName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );
  protected readonly statusLabel = computed(() => {
    const status = this.view()?.status ?? '';
    return this.t().demoBooking.manage.status[status] ?? status;
  });
  protected readonly noticeText = computed(() => {
    const copy = this.t().demoBooking;
    switch (this.notice()) {
      case 'rescheduled':
        return copy.manage.rescheduled;
      case 'cancelled':
        return copy.manage.cancelled;
      case 'slotTaken':
        return copy.errors.slotTaken;
      case 'cannotChange':
        return copy.manage.cannotChange;
      case 'throttled':
        return copy.errors.throttled(formatClock(this.cooldown.secondsLeft()));
      case 'network':
        return copy.errors.network;
      case 'generic':
        return copy.errors.generic;
      default:
        return null;
    }
  });

  constructor() {
    // El fragmento solo existe en el navegador.
    afterNextRender(() => {
      this.token = readToken(window.location.hash);
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.cooldown.stop();
  }

  protected load(): void {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    this.state.set('loading');
    this.api.view(this.token).subscribe({
      next: (view) => {
        this.show(view);
        this.state.set('ready');
      },
      error: (err: unknown) => this.state.set(isTransient(err) ? 'error' : 'invalid'),
    });
  }

  protected startReschedule(): void {
    const view = this.view();
    if (!view?.canChange) {
      return;
    }
    this.notice.set(null);
    this.selectedSlot.set(null);
    this.mode.set('reschedule');
    this.picker.slug.set(view.pageSlug);
    this.picker.load();
  }

  protected startCancel(): void {
    this.notice.set(null);
    this.reason.set('');
    this.mode.set('cancel');
  }

  protected backToView(): void {
    this.mode.set('view');
  }

  protected confirmReschedule(): void {
    const slot = this.selectedSlot();
    if (!this.token || !slot || this.busy() || this.cooldown.active()) {
      return;
    }
    this.busy.set(true);
    this.api.reschedule(this.token, slot).subscribe({
      next: (result) => {
        this.busy.set(false);
        // El enlace anterior dejó de servir: el nuevo queda en la barra para recargar sin perderlo.
        this.token = result.managementToken;
        replaceToken(result.managementToken);
        this.show(result.booking);
        this.mode.set('view');
        this.notice.set('rescheduled');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.onChangeError(err);
      },
    });
  }

  protected confirmCancel(): void {
    if (!this.token || this.busy() || this.cooldown.active() || this.reason().length > MAX_REASON) {
      return;
    }
    this.busy.set(true);
    this.api.cancel(this.token, this.reason().trim() || null).subscribe({
      next: () => {
        this.busy.set(false);
        this.token = null;
        const view = this.view();
        this.view.set(view ? { ...view, status: 'Cancelled', canChange: false } : null);
        this.mode.set('view');
        this.notice.set('cancelled');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.onChangeError(err);
      },
    });
  }

  private show(view: PublicBookingManageView): void {
    this.view.set(view);
    if (isValidZone(view.timeZone)) {
      this.picker.timeZone.set(view.timeZone);
    }
  }

  private onChangeError(err: unknown): void {
    switch (apiErrorCode(err)) {
      case E.slotTaken:
      case E.slotInPast:
        this.selectedSlot.set(null);
        this.notice.set('slotTaken');
        this.picker.load();
        return;
      case E.alreadyHappened:
      case E.notConfirmed:
        this.view.update((view) => (view ? { ...view, canChange: false } : view));
        this.mode.set('view');
        this.notice.set('cannotChange');
        return;
      case E.notFound:
        this.state.set('invalid');
        return;
      default:
        this.fail(err);
    }
  }

  private fail(err: unknown): void {
    const throttle = readThrottle(err);
    if (throttle) {
      this.cooldown.start(throttle.retryAfterSeconds);
      this.notice.set('throttled');
      return;
    }
    this.notice.set(err instanceof HttpErrorResponse && err.status === 0 ? 'network' : 'generic');
  }
}

/** `#token=…` del enlace del correo. */
export function readToken(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token')?.trim();
  return token ? token : null;
}

function replaceToken(token: string): void {
  try {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${location.search}#token=${encodeURIComponent(token)}`,
    );
  } catch {
    // Sin History API: el enlace del correo nuevo sigue sirviendo.
  }
}

function isTransient(err: unknown): boolean {
  return (
    err instanceof HttpErrorResponse &&
    (err.status === 0 || err.status === 429 || err.status >= 500)
  );
}
