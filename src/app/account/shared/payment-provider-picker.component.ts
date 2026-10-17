import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { catchError, of } from 'rxjs';
import {
  AccountPaymentOption,
  AccountPaymentOptionsService,
  DEFAULT_PAYMENT_OPTION,
} from '@core/account/account-payment-options.service';
import { AccountSubscriptionStore } from '@core/account/account-subscription.store';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Modal "Choose how to pay" compartido entre add-ons, seats, renewal y plan-change del Account.
 * Patrón espejo del `wallet-page.selectProvider` del CRM, adaptado al stack del landing.
 *
 * Responsive:
 *  - Mobile (<640): modal fullscreen con drag-handle visual, botones apilados verticalmente.
 *  - Desktop (>=640): modal centrado 420px, botones en grid de 1 columna por default (si crecen
 *    los proveedores a 3+, el grid se adapta a 2 columnas automáticamente vía `sm:grid-cols-2`).
 *
 * Accesibilidad:
 *  - `<dialog>` nativo HTML con `showModal()` (focus trap + Escape automático).
 *  - `role=radiogroup` sobre la lista; cada opción es un `role=radio` con `aria-checked`.
 *  - El confirm button no se habilita hasta que hay una opción marcada.
 */
@Component({
  selector: 'app-payment-provider-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50 flex items-end justify-center bg-twilight/40 backdrop-blur-[2px] sm:items-center"
        role="presentation"
        (click)="onBackdropClick($event)"
      >
        <div
          class="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="headingId"
          (click)="$event.stopPropagation()"
        >
          <!-- Mobile drag-handle (puramente visual, confirma que es modal pullable) -->
          <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-sand sm:hidden" aria-hidden="true"></div>

          <h2 [id]="headingId" class="text-lg font-semibold tracking-tight text-twilight">
            {{ t().accPaymentPickerTitle }}
          </h2>
          <p class="mt-1 text-[13px] text-muted">{{ t().accPaymentPickerSubtitle }}</p>

          @if (loading()) {
            <div class="mt-5 space-y-3" role="status" [attr.aria-label]="t().accLoading">
              <div class="h-16 animate-pulse rounded-xl bg-sand"></div>
              <div class="h-16 animate-pulse rounded-xl bg-sand"></div>
            </div>
          } @else if (options().length === 0) {
            <p role="alert" class="mt-5 rounded-xl border border-twilight/30 bg-sand px-4 py-3 text-[13px] font-medium text-twilight">
              {{ t().accPaymentPickerEmpty }}
            </p>
          } @else {
            <div role="radiogroup" [attr.aria-label]="t().accPaymentPickerTitle" class="mt-5 grid gap-2">
              @for (option of options(); track option.provider + ':' + option.method) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="isSelected(option)"
                  (click)="select(option)"
                  class="group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star focus-visible:ring-offset-2"
                  [class.border-twilight]="isSelected(option)"
                  [class.bg-sand]="isSelected(option)"
                  [class.border-line]="!isSelected(option)"
                  [class.bg-white]="!isSelected(option)"
                  [class.hover:bg-cream]="!isSelected(option)"
                >
                  <span
                    class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]"
                    [class.bg-twilight]="isSelected(option)"
                    [class.text-white]="isSelected(option)"
                    [class.bg-sand]="!isSelected(option)"
                    [class.text-twilight]="!isSelected(option)"
                  >
                    <ion-icon [name]="iconFor(option)" class="text-xl" aria-hidden="true"></ion-icon>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[14px] font-semibold text-twilight">{{ labelFor(option) }}</span>
                    <span class="block text-xs text-muted">{{ hintFor(option) }}</span>
                  </span>
                  <span
                    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                    [class.border-twilight]="isSelected(option)"
                    [class.border-line]="!isSelected(option)"
                  >
                    @if (isSelected(option)) {
                      <span class="h-2 w-2 rounded-full bg-twilight"></span>
                    }
                  </span>
                </button>
              }
            </div>
          }

          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="cancel()"
              class="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-twilight hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star focus-visible:ring-offset-2"
            >
              {{ t().accPaymentPickerCancel }}
            </button>
            <button
              type="button"
              (click)="confirm()"
              [disabled]="!canConfirm()"
              class="rounded-lg bg-twilight px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-star disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star focus-visible:ring-offset-2"
            >
              {{ t().accPaymentPickerConfirm }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PaymentProviderPickerComponent {
  private readonly options$ = inject(AccountPaymentOptionsService);
  private readonly subscription = inject(AccountSubscriptionStore);
  private readonly i18n = inject(TranslationStore);

  /** El padre pasa una signal/computed; Angular le entrega al hijo la referencia (función llamable).
   * El `effect()` del constructor sí trackea los reads del signal y dispara `load()` cuando pasa a true;
   * `ngOnChanges` nunca disparaba porque la referencia del signal no cambia aunque sí su valor. */
  @Input({ required: true }) open: () => boolean = () => false;

  @Output() confirmed = new EventEmitter<AccountPaymentOption>();
  @Output() dismissed = new EventEmitter<void>();

  readonly t = this.i18n.t;
  readonly loading = signal(false);
  readonly options = signal<AccountPaymentOption[]>([]);
  readonly selected = signal<AccountPaymentOption | null>(null);

  readonly canConfirm = computed(() => this.selected() !== null && !this.loading());

  /** Id estable para el aria-labelledby — el DOM id debe ser único entre instancias. */
  readonly headingId = `payment-picker-heading-${Math.random().toString(36).slice(2, 9)}`;

  /** Marca lo ya cargado para no re-fetchar en re-aperturas inmediatas del mismo picker. */
  private lastOpenState = false;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !this.lastOpenState) {
        this.load();
      }
      this.lastOpenState = isOpen;
    });
  }

  private load(): void {
    this.loading.set(true);
    this.selected.set(null);
    this.options$
      .getEnabled()
      .pipe(catchError(() => of([DEFAULT_PAYMENT_OPTION])))
      .subscribe(opts => {
        this.options.set(opts);
        this.selected.set(this.pickDefault(opts));
        this.loading.set(false);
      });
  }

  /**
   * Pre-selección en orden de preferencia:
   *  1. El proveedor guardado como `providerCode` del tenant (<c>TenantBillingPreference</c>) — si el
   *     admin ya eligió "mi dinero sale por PayPal", respetarlo evita que el modal lo haga re-elegir
   *     cada compra. Match case-insensitive por `provider`.
   *  2. La primera opción del catálogo ordenada por `priority` — el default del sistema.
   *  3. null si no hay opciones (loader/empty state cubre esto en el template).
   */
  private pickDefault(opts: AccountPaymentOption[]): AccountPaymentOption | null {
    if (opts.length === 0) return null;
    const preferred = this.subscription.preference()?.providerCode?.trim();
    if (preferred) {
      const match = opts.find(o => o.provider.toLowerCase() === preferred.toLowerCase());
      if (match) return match;
    }
    return opts[0];
  }

  select(option: AccountPaymentOption): void {
    this.selected.set(option);
  }

  isSelected(option: AccountPaymentOption): boolean {
    const current = this.selected();
    return current?.provider === option.provider && current?.method === option.method;
  }

  confirm(): void {
    const choice = this.selected();
    if (choice) {
      this.confirmed.emit(choice);
    }
  }

  cancel(): void {
    this.dismissed.emit();
  }

  onBackdropClick(_event: MouseEvent): void {
    this.cancel();
  }

  /** Convención ionicons: logo específico por provider; fallback al genérico de tarjeta. */
  iconFor(option: AccountPaymentOption): string {
    const p = option.provider.toLowerCase();
    if (p === 'stripe') return 'card-outline';
    if (p === 'paypal') return 'logo-paypal';
    return 'wallet-outline';
  }

  /** Label user-facing; prioriza `displayName` del backend, cae al provider. */
  labelFor(option: AccountPaymentOption): string {
    return option.displayName?.trim() || option.provider;
  }

  /** Hint secundario — el método (Card, PayPal, etc.) ayuda a distinguir Stripe/Card vs Stripe/BankTransfer. */
  hintFor(option: AccountPaymentOption): string {
    return `${option.provider} · ${option.method}`;
  }
}
