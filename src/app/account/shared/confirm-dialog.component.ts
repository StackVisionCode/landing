import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, input, output, signal } from '@angular/core';

/** Diálogo de confirmación reusable: reemplaza window.confirm con un modal consistente con el shell. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input('Confirm');
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly tone = input<'neutral' | 'danger'>('neutral');

  readonly confirmed = output<void>();
  readonly dismissed = output<void>();

  readonly submitting = signal(false);

  protected readonly confirmClasses = computed(() =>
    this.tone() === 'danger'
      ? 'bg-twilight hover:bg-star text-white'
      : 'bg-twilight hover:bg-star text-white'
  );

  confirm(): void {
    if (this.submitting()) return;
    this.confirmed.emit();
  }

  dismiss(): void {
    if (this.submitting()) return;
    this.dismissed.emit();
  }
}
