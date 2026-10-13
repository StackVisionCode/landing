import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';

/** Desliza para confirmar: el asa sigue al dedo y, pasada la marca, termina sola el recorrido (inspirado en Bencho · Slide to confirm). */
@Component({
  selector: 'app-demo-pay',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="w-full max-w-[380px] rounded-2xl bg-white p-4 shadow-[0_20px_50px_rgba(8,54,69,0.3)]">
      <div class="mb-4 flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-star text-white"><ion-icon name="receipt-outline" class="text-xl"></ion-icon></span>
        <div class="leading-tight">
          <p class="text-sm font-semibold text-twilight">{{ d().invoice }}</p>
          <p class="text-xs text-muted">{{ d().sub }}</p>
        </div>
      </div>

      <div #track class="relative h-14 overflow-hidden rounded-full select-none touch-none" [class]="confirmed() ? 'bg-lime' : 'bg-cream'" style="transition: background-color 0.4s">
        <div class="absolute inset-y-0 left-0 rounded-full bg-azure/50" [style.width.px]="x() + 56" [class.transition-[width]]="!dragging()" [class.duration-300]="!dragging()"></div>
        <p class="absolute inset-0 flex items-center justify-center pl-8 text-sm font-semibold transition-opacity duration-300" [class]="confirmed() ? 'text-twilight' : 'text-muted'" [style.opacity]="confirmed() ? 1 : 1 - Math.min(1, x() / 140)">
          {{ confirmed() ? d().done : d().slide }}
        </p>
        <button
          type="button"
          class="absolute left-1 top-1 flex h-12 w-12 items-center justify-center rounded-full bg-twilight text-white shadow-md"
          [class.transition-transform]="!dragging()"
          [class.duration-300]="!dragging()"
          [style.transform]="'translateX(' + x() + 'px)'"
          (pointerdown)="down($event)"
          (pointermove)="move($event)"
          (pointerup)="up()"
          (pointercancel)="up()"
          [attr.aria-label]="d().slide"
        >
          <ion-icon [name]="confirmed() ? 'checkmark-outline' : 'chevron-forward-outline'" class="text-xl"></ion-icon>
        </button>
      </div>
      <p class="mt-3 h-4 text-center text-xs text-muted transition-opacity duration-500" [class.opacity-0]="!confirmed()">{{ d().doneNote }}</p>
    </div>
  `,
})
export class DemoPayComponent implements OnDestroy {
  private readonly t = inject(TranslationStore).c;
  protected readonly d = computed(() => this.t().features.demo.pay);
  protected readonly Math = Math;

  @ViewChild('track') private trackRef?: ElementRef<HTMLElement>;
  protected readonly x = signal(0);
  protected readonly dragging = signal(false);
  protected readonly confirmed = signal(false);
  private startX = 0;
  private max = 0;
  private resetTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearTimeout(this.resetTimer);
  }

  protected down(e: PointerEvent): void {
    if (this.confirmed()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.max = (this.trackRef?.nativeElement.clientWidth ?? 300) - 56;
    this.startX = e.clientX - this.x();
    this.dragging.set(true);
  }

  protected move(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.x.set(Math.min(this.max, Math.max(0, e.clientX - this.startX)));
  }

  protected up(): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    if (this.x() > this.max * 0.8) {
      this.x.set(this.max);
      this.confirmed.set(true);
      this.resetTimer = setTimeout(() => {
        this.confirmed.set(false);
        this.x.set(0);
      }, 3000);
    } else {
      this.x.set(0);
    }
  }
}
