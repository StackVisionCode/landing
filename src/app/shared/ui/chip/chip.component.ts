import { Component, Input } from '@angular/core';

export type ChipVariant = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

/** Pill de estado/metadata: `rounded-full border`, nunca relleno (patrón "Aether"). */
const VARIANT_CLASSES: Record<ChipVariant, string> = {
  brand: 'border-brand-200 text-brand-800',
  success: 'border-emerald-200 text-emerald-600',
  warning: 'border-orange-200 text-orange-500',
  danger: 'border-red-200 text-red-500',
  neutral: 'border-gray-200 text-gray-500',
};

@Component({
  selector: 'app-chip',
  templateUrl: './chip.component.html',
})
export class ChipComponent {
  @Input() variant: ChipVariant = 'neutral';

  get variantClass(): string {
    return VARIANT_CLASSES[this.variant];
  }
}
