import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { formatClock } from '@core/http/throttling';
import { TranslationStore } from '@core/i18n/translation.store';

const LENGTH = 6;
/** Retención completa (10 min): base del anillo. */
const HOLD_SECONDS = 600;
/** Circunferencia del anillo (r = 18). */
const RING = 113.1;

/**
 * Paso 3: el código en 6 casillas (DEMO-11). Pegar reparte los dígitos, escribir avanza solo y con los 6 se
 * envía; la primera casilla lleva `one-time-code` para el autocompletado. Un anillo muestra cuánto queda del
 * horario apartado.
 */
@Component({
  selector: 'app-verify-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-code.component.html',
})
export class VerifyCodeComponent {
  readonly email = input.required<string>();
  readonly slotLabel = input.required<string>();
  readonly heldSeconds = input.required<number>();
  readonly invalid = input(false);
  readonly busy = input(false);
  readonly blocked = input(false);
  readonly resendSeconds = input(0);

  readonly verified = output<string>();
  readonly resend = output<void>();
  readonly editDetails = output<void>();

  protected readonly t = inject(TranslationStore).c;
  protected readonly clock = formatClock;
  protected readonly indexes = Array.from({ length: LENGTH }, (_, i) => i);
  protected readonly digits = signal<string[]>(Array(LENGTH).fill(''));
  protected readonly ring = RING;
  protected readonly ringOffset = computed(
    () => RING * (1 - Math.min(1, this.heldSeconds() / HOLD_SECONDS)),
  );
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.box(0)?.focus());
    // Código equivocado: se vacían las casillas y se vuelve a la primera.
    effect(() => {
      if (this.invalid()) {
        untracked(() => {
          this.digits.set(Array(LENGTH).fill(''));
          this.box(0)?.focus();
        });
      }
    });
  }

  protected onInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value.replace(/\D/g, '');
    if (value.length > 1) {
      // Autocompletado del sistema o varios dígitos escritos de golpe.
      this.fill(value, index);
      return;
    }
    this.setDigit(index, value);
    target.value = value;
    if (value && index < LENGTH - 1) {
      this.box(index + 1)?.focus();
    }
    this.trySubmit();
  }

  protected onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      event.preventDefault();
      this.setDigit(index - 1, '');
      this.box(index - 1)?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.box(index - 1)?.focus();
    } else if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      this.box(index + 1)?.focus();
    }
  }

  protected onPaste(index: number, event: ClipboardEvent): void {
    event.preventDefault();
    this.fill(event.clipboardData?.getData('text') ?? '', index);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.busy() && !this.blocked()) {
      this.verified.emit(this.digits().join(''));
    }
  }

  /** Reparte los dígitos desde la casilla dada; ignora el texto que acompaña al código. */
  private fill(text: string, from: number): void {
    const incoming = text
      .replace(/\D/g, '')
      .slice(0, LENGTH - from)
      .split('');
    const next = [...this.digits()];
    incoming.forEach((digit, offset) => (next[from + offset] = digit));
    this.digits.set(next);
    const boxes = this.boxes();
    next.forEach((digit, i) => {
      if (boxes[i]) {
        boxes[i].value = digit;
      }
    });
    this.box(Math.min(LENGTH - 1, from + incoming.length))?.focus();
    this.trySubmit();
  }

  private setDigit(index: number, digit: string): void {
    const next = [...this.digits()];
    next[index] = digit;
    this.digits.set(next);
  }

  private trySubmit(): void {
    const code = this.digits().join('');
    if (code.length === LENGTH && !this.busy() && !this.blocked()) {
      this.verified.emit(code);
    }
  }

  private boxes(): HTMLInputElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLInputElement>('input[data-otp]')];
  }

  private box(index: number): HTMLInputElement | undefined {
    return this.boxes()[index];
  }
}
