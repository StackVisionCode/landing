import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';

/** Checklist: tachar una tarea dibuja la línea y la casilla (inspirado en Bencho · Animated checklist). */
@Component({
  selector: 'app-demo-tasks',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="w-full max-w-[380px] rounded-2xl bg-white p-4 shadow-[0_20px_50px_rgba(8,54,69,0.3)]">
      <div class="mb-3 flex items-center justify-between">
        <p class="text-xs font-medium text-muted">{{ d().label }}</p>
        <span class="rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-twilight">{{ d().counter(doneCount(), d().items.length) }}</span>
      </div>
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-sand">
        <div class="h-full rounded-full bg-azure transition-[width] duration-500 ease-out" [style.width.%]="(doneCount() / d().items.length) * 100"></div>
      </div>
      <div class="flex flex-col gap-1.5">
        @for (item of d().items; track item; let i = $index) {
          <button type="button" (click)="toggle(i)" [attr.aria-pressed]="done().has(i)" class="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left hover:bg-cream">
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-300"
              [class]="done().has(i) ? 'border-star bg-star text-white' : 'border-line bg-white text-transparent'"
            >
              <ion-icon name="checkmark-outline" class="text-sm transition-transform duration-300" [class]="done().has(i) ? 'scale-100' : 'scale-0'"></ion-icon>
            </span>
            <span class="relative min-w-0 flex-1 text-sm font-medium transition-colors duration-300" [class]="done().has(i) ? 'text-muted' : 'text-twilight'">
              {{ item }}
              <span class="absolute left-0 top-1/2 h-0.5 rounded-full bg-twilight/60 transition-[width] duration-500 ease-out" [style.width.%]="done().has(i) ? 100 : 0"></span>
            </span>
          </button>
        }
      </div>
    </div>
  `,
})
export class DemoTasksComponent {
  private readonly t = inject(TranslationStore).c;
  protected readonly d = computed(() => this.t().features.demo.tasks);
  protected readonly done = signal<Set<number>>(new Set([0]));
  protected readonly doneCount = computed(() => this.done().size);

  toggle(i: number): void {
    const next = new Set(this.done());
    if (!next.delete(i)) next.add(i);
    this.done.set(next);
  }
}
