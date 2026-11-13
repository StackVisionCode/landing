import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { platformSupportEmail } from '@core/config/platform-runtime';
import { TranslationStore } from '@core/i18n/translation.store';
import {
  OFFICE_SIZES,
  type OfficeSize,
  type PublicBookingPage,
} from '@core/public-booking/public-booking.models';
import { TurnstileWidget } from '@core/public-booking/turnstile.loader';
import type { DetailsForm, FieldError, FieldKey } from './booking-flow.store';

/** Fábrica del widget anti-bot: las pruebas la cambian por una que no carga Cloudflare. */
export interface BotWidget {
  mount(container: HTMLElement, siteKey: string, language?: string): Promise<void>;
  next(): Promise<string | null>;
  reset(): void;
  destroy(): void;
}
export const BOT_WIDGET_FACTORY = new InjectionToken<() => BotWidget>('BOT_WIDGET_FACTORY', {
  providedIn: 'root',
  factory: () => () => {
    const widget = new TurnstileWidget();
    return {
      mount: (container, siteKey, language) => widget.mount(container, siteKey, undefined, language),
      next: () => widget.next(),
      reset: () => widget.reset(),
      destroy: () => widget.destroy(),
    };
  },
});

/** Un tramo del aviso de privacidad: texto o un enlace interno (`[Privacy Policy](/privacy)`). */
export interface NoticePart {
  readonly text: string;
  readonly link: string | null;
}

/** Solo enlaces relativos del propio sitio; cualquier otra cosa queda como texto. */
export function noticeParts(notice: string): NoticePart[] {
  const parts: NoticePart[] = [];
  const pattern = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  for (const match of notice.matchAll(pattern)) {
    if (match.index > last) {
      parts.push({ text: notice.slice(last, match.index), link: null });
    }
    parts.push({ text: match[1], link: match[2] });
    last = match.index + match[0].length;
  }
  if (last < notice.length) {
    parts.push({ text: notice.slice(last), link: null });
  }
  return parts;
}

/**
 * Paso 2: una columna (Baymard). A la vista lo necesario; lo opcional plegado en "Add details". Cada campo se
 * valida al salir de él y muestra su ✓; el email avisa de un dominio mal escrito. El envío pasa por Turnstile.
 */
@Component({
  selector: 'app-booking-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './booking-details.component.html',
})
export class BookingDetailsComponent implements OnDestroy {
  readonly page = input.required<PublicBookingPage>();
  readonly form = input.required<DetailsForm>();
  readonly errors = input.required<Partial<Record<FieldKey, FieldError>>>();
  readonly validFields = input<ReadonlySet<FieldKey>>(new Set());
  readonly emailSuggestion = input<string | null>(null);
  readonly busy = input(false);
  readonly blocked = input(false);
  readonly slotLabel = input.required<string>();

  readonly formChange = output<Partial<DetailsForm>>();
  readonly submitted = output<string | null>();
  readonly back = output<void>();
  readonly fieldBlur = output<FieldKey>();

  protected readonly t = inject(TranslationStore).c;
  private readonly lang = inject(TranslationStore).lang;
  protected readonly sizes = OFFICE_SIZES;
  protected readonly notice = computed(() => noticeParts(this.page().privacyNotice));
  /** Lo opcional se pliega; lo que la página exige queda a la vista. */
  protected readonly optionalFields = computed(() => {
    const page = this.page();
    return {
      officeSize: page.officeSizeField === 'Optional',
      phone: page.phoneField === 'Optional',
      interest: page.interestField === 'Optional',
    };
  });
  protected readonly hasOptional = computed(() =>
    Object.values(this.optionalFields()).some(Boolean),
  );
  protected readonly selectedOption = computed(
    () =>
      this.page().heardAboutOptions.find((option) => option.code === this.form().heardAboutCode) ??
      null,
  );

  protected readonly supportEmail = platformSupportEmail();
  /** Esperando el token de Turnstile: el botón lo muestra como envío en curso. */
  protected readonly checking = signal(false);
  /** Turnstile no cargó o no dio token: aviso junto al botón con "Try again". */
  protected readonly botProblem = signal(false);

  private readonly botContainer = viewChild<ElementRef<HTMLElement>>('bot');
  private readonly widget: BotWidget | null;
  /** True si el widget quedó montado. */
  private mounting: Promise<boolean> = Promise.resolve(false);

  constructor() {
    const create = inject(BOT_WIDGET_FACTORY);
    this.widget = create();
    // Turnstile se carga recién aquí (paso 2), nunca en la carga inicial del landing.
    afterNextRender(() => this.mountBot());
  }

  ngOnDestroy(): void {
    this.widget?.destroy();
  }

  protected errorText(key: FieldKey): string | null {
    const error = this.errors()[key];
    if (!error) {
      return null;
    }
    const copy = this.t().demoBooking.errors;
    return error === 'required'
      ? copy.required
      : error === 'email'
        ? copy.email
        : error === 'phone'
          ? copy.phone
          : error === 'tooLong'
            ? copy.tooLong
            : copy.invalidCode;
  }

  protected set<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]): void {
    this.formChange.emit({ [key]: value } as Partial<DetailsForm>);
  }

  protected valid(key: FieldKey): boolean {
    return this.validFields().has(key);
  }

  protected blur(key: FieldKey): void {
    this.fieldBlur.emit(key);
  }

  /** Cambio en un select: se valida al momento (no hay "salir del campo" con el mouse). */
  protected choose<K extends keyof DetailsForm>(
    key: K,
    value: DetailsForm[K],
    field: FieldKey,
  ): void {
    this.set(key, value);
    this.fieldBlur.emit(field);
  }

  protected applySuggestion(email: string): void {
    this.set('email', email);
    this.fieldBlur.emit('email');
  }

  protected sizeLabel(size: OfficeSize): string {
    return this.t().demoBooking.officeSizes[size];
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.blocked() || this.checking()) {
      return;
    }
    if (!this.page().turnstileSiteKey) {
      this.submitted.emit(null);
      return;
    }
    this.botProblem.set(false);
    this.checking.set(true);
    const token = await this.botToken();
    this.checking.set(false);
    if (!token) {
      this.botProblem.set(true);
      return;
    }
    this.submitted.emit(token);
    // Cada token sirve una vez.
    this.widget?.reset();
  }

  protected retryBot(event: Event): void {
    this.botProblem.set(false);
    void this.mounting.then((mounted) => {
      if (mounted) {
        this.widget?.reset();
      } else {
        this.widget?.destroy();
        this.mountBot();
      }
      return this.submit(event);
    });
  }

  private mountBot(): void {
    const siteKey = this.page().turnstileSiteKey;
    const container = this.botContainer()?.nativeElement;
    if (siteKey && container && this.widget) {
      this.mounting = this.widget.mount(container, siteKey, this.lang()).then(
        () => true,
        () => false,
      );
    }
  }

  /** Un reintento con `reset` si Cloudflare no dio token la primera vez. */
  private async botToken(): Promise<string | null> {
    if (!(await this.mounting)) {
      return null;
    }
    const first = (await this.widget?.next()) ?? null;
    if (first) {
      return first;
    }
    this.widget?.reset();
    return (await this.widget?.next()) ?? null;
  }
}
