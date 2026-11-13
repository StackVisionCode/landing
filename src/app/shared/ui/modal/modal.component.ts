import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  viewChild,
} from '@angular/core';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

/** Ancho máximo del panel por tamaño (Tailwind); por debajo de `sm` el panel ocupa la pantalla. */
const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-4xl',
  '3xl': 'sm:max-w-6xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let nextId = 0;

/**
 * Shell de modal reusable (estilo "Aether"): backdrop que cierra al click, panel `rounded-[28px]` con scroll
 * interno, header con título + X y un `<ng-content>`. Accesible (DEMO-08): `role="dialog"`, `aria-modal`,
 * título enlazado, foco atrapado, Escape, foco devuelto al cerrar y scroll del fondo bloqueado.
 */
@Component({
  selector: 'app-modal',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
})
export class ModalComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() heading = '';
  @Input() subheading = '';
  @Input() size: ModalSize = 'lg';
  @Input() closeLabel = 'Close';
  /** Apagado cuando cerrar por un clic en el fondo haría perder trabajo (NN/g, cierre accidental). */
  @Input() closeOnBackdrop = true;
  @Output() closed = new EventEmitter<void>();

  protected readonly titleId = `modal-title-${++nextId}`;
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private returnFocus: HTMLElement | null = null;
  private previousOverflow = '';

  get sizeClass(): string {
    return SIZE_CLASSES[this.size];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen'] || typeof document === 'undefined') {
      return;
    }
    if (this.isOpen) {
      this.onOpen();
    } else if (!changes['isOpen'].firstChange) {
      this.onClose();
    }
  }

  ngOnDestroy(): void {
    if (this.isOpen && typeof document !== 'undefined') {
      this.onClose();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.closed.emit();
    }
  }

  /** Tab y Shift+Tab no salen del panel (Angular separa `tab` de `shift.tab`). */
  @HostListener('document:keydown.tab', ['$event'])
  @HostListener('document:keydown.shift.tab', ['$event'])
  onTab(event: Event): void {
    const panel = this.panel()?.nativeElement;
    if (!this.isOpen || !panel) {
      return;
    }
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const shift = (event as KeyboardEvent).shiftKey;
    const active = document.activeElement;
    if (shift && (active === first || active === panel || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!shift && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  close(): void {
    this.closed.emit();
  }

  protected onBackdrop(): void {
    if (this.closeOnBackdrop) {
      this.closed.emit();
    }
  }

  private onOpen(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // El panel aparece en el siguiente ciclo del @if.
    setTimeout(() => this.panel()?.nativeElement.focus(), 0);
  }

  private onClose(): void {
    document.body.style.overflow = this.previousOverflow;
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) {
      setTimeout(() => target.focus(), 0);
    }
  }
}
