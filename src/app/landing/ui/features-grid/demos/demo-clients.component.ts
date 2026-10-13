import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';

/** Selección múltiple: las filas se elevan al elegirlas y el botón crece desde el centro (inspirado en Bencho · Selection list). */
@Component({
  selector: 'app-demo-clients',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="w-full max-w-[380px] rounded-2xl bg-white p-4 shadow-[0_20px_50px_rgba(8,54,69,0.3)]">
      <p class="mb-3 text-xs font-medium text-muted">{{ d().label }}</p>
      <div class="flex flex-col gap-2">
        @for (c of d().list; track c.name; let i = $index) {
          <button
            type="button"
            (click)="toggle(i)"
            [attr.aria-pressed]="selected().has(i)"
            class="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            [class]="selected().has(i) ? 'bg-twilight -translate-y-0.5 scale-[1.02] shadow-lg' : 'bg-cream hover:bg-sand'"
          >
            <img [src]="avatars[i]" alt="" class="h-9 w-9 rounded-full object-cover" />
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate text-sm font-semibold" [class]="selected().has(i) ? 'text-white' : 'text-twilight'">{{ c.name }}</span>
              <span class="block truncate text-xs" [class]="selected().has(i) ? 'text-cream' : 'text-muted'">{{ c.note }}</span>
            </span>
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300"
              [class]="selected().has(i) ? 'scale-100 border-lime bg-lime text-twilight' : 'scale-90 border-line bg-white text-transparent'"
            >
              <ion-icon name="checkmark-outline" class="text-sm"></ion-icon>
            </span>
          </button>
        }
      </div>
      <div
        class="grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        [class]="count() ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
      >
        <div class="overflow-hidden">
          <button type="button" class="mt-3 w-full rounded-full bg-lime px-4 py-2.5 text-sm font-semibold text-twilight transition-transform active:scale-95" [attr.tabindex]="count() ? 0 : -1">
            {{ d().action(count()) }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DemoClientsComponent {
  protected readonly d = computed(() => this.t().features.demo.clients);
  private readonly t = inject(TranslationStore).c;
  protected readonly avatars = ['img/r1.jpg', 'img/r2.jpg', 'img/r3.jpg', 'img/r4.jpg'];
  protected readonly selected = signal<Set<number>>(new Set([0]));
  protected readonly count = computed(() => this.selected().size);

  toggle(i: number): void {
    const next = new Set(this.selected());
    if (!next.delete(i)) next.add(i);
    this.selected.set(next);
  }
}
