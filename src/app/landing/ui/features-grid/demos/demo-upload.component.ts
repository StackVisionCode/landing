import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';

type UploadState = 'idle' | 'over' | 'uploading' | 'done';

/** Dropzone: arrastra (o toca) un archivo de la bandeja, sube con progreso y queda el enlace seguro (inspirado en Bencho · Upload dropzone). */
@Component({
  selector: 'app-demo-upload',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="w-full max-w-[380px] rounded-2xl bg-white p-4 shadow-[0_20px_50px_rgba(8,54,69,0.3)]">
      <div
        class="relative flex h-[170px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-all duration-300"
        [class]="state() === 'over' ? 'scale-[1.02] border-star bg-azure/20' : state() === 'done' ? 'border-transparent bg-cream' : 'border-line bg-cream'"
        (dragover)="over($event)"
        (dragleave)="leave()"
        (drop)="drop($event)"
      >
        @switch (state()) {
          @case ('uploading') {
            <ion-icon name="document-text-outline" class="text-3xl text-star"></ion-icon>
            <p class="text-sm font-semibold text-twilight">{{ current()?.name }}</p>
            <div class="h-1.5 w-40 overflow-hidden rounded-full bg-sand">
              <div class="h-full rounded-full bg-star transition-[width] duration-100" [style.width.%]="progress()"></div>
            </div>
            <p class="text-xs text-muted">{{ d().uploading }} {{ progress() }}%</p>
          }
          @case ('done') {
            <span class="flex h-11 w-11 items-center justify-center rounded-full bg-lime text-twilight"><ion-icon name="checkmark-outline" class="text-2xl"></ion-icon></span>
            <p class="text-sm font-semibold text-twilight">{{ d().done }}</p>
            <p class="text-xs text-muted">{{ d().doneNote }}</p>
            <button type="button" (click)="reset()" class="text-xs font-semibold text-star hover:underline">{{ d().another }}</button>
          }
          @default {
            <ion-icon name="cloud-upload-outline" class="text-3xl transition-transform duration-300" [class]="state() === 'over' ? '-translate-y-1 text-star' : 'text-muted'"></ion-icon>
            <p class="text-sm font-medium text-twilight">{{ state() === 'over' ? d().drop : d().tray }}</p>
          }
        }
      </div>

      <div class="mt-3 flex gap-2">
        @for (f of d().files; track f.name; let i = $index) {
          @if (!used().has(i)) {
            <button
              type="button"
              draggable="true"
              (dragstart)="drag($event, i)"
              (click)="begin(i)"
              [disabled]="state() === 'uploading'"
              class="flex flex-1 cursor-grab items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing disabled:opacity-50"
            >
              <ion-icon name="document-outline" class="text-lg text-star"></ion-icon>
              <span class="min-w-0 leading-tight">
                <span class="block truncate text-xs font-semibold text-twilight">{{ f.name }}</span>
                <span class="block text-[11px] text-muted">{{ f.size }}</span>
              </span>
            </button>
          }
        }
      </div>
    </div>
  `,
})
export class DemoUploadComponent implements OnDestroy {
  private readonly t = inject(TranslationStore).c;
  protected readonly d = computed(() => this.t().features.demo.upload);

  protected readonly state = signal<UploadState>('idle');
  protected readonly progress = signal(0);
  protected readonly used = signal<Set<number>>(new Set());
  protected readonly currentIndex = signal<number | null>(null);
  protected readonly current = computed(() => {
    const i = this.currentIndex();
    return i === null ? null : this.d().files[i];
  });
  private timer?: ReturnType<typeof setInterval>;

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  protected drag(e: DragEvent, i: number): void {
    e.dataTransfer?.setData('text/plain', String(i));
  }

  protected over(e: DragEvent): void {
    e.preventDefault();
    if (this.state() === 'idle') this.state.set('over');
  }

  protected leave(): void {
    if (this.state() === 'over') this.state.set('idle');
  }

  protected drop(e: DragEvent): void {
    e.preventDefault();
    const i = Number(e.dataTransfer?.getData('text/plain'));
    if (Number.isNaN(i)) {
      this.state.set('idle');
      return;
    }
    this.begin(i);
  }

  protected begin(i: number): void {
    if (this.state() === 'uploading') return;
    this.currentIndex.set(i);
    this.progress.set(0);
    this.state.set('uploading');
    this.timer = setInterval(() => {
      const next = Math.min(100, this.progress() + 4 + Math.round(Math.random() * 6));
      this.progress.set(next);
      if (next >= 100) {
        clearInterval(this.timer);
        this.used.update((u) => new Set(u).add(i));
        this.state.set('done');
      }
    }, 90);
  }

  protected reset(): void {
    if (this.used().size >= this.d().files.length) this.used.set(new Set());
    this.state.set('idle');
  }
}
