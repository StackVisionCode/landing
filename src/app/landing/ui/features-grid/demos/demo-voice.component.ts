import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';

type VoiceState = 'idle' | 'rec' | 'done';

/** Nota de voz: mantén para grabar (onda en vivo), desliza a la izquierda para descartar, toca la onda para reproducir (inspirado en Bencho · Voice note). */
@Component({
  selector: 'app-demo-voice',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-[0_20px_50px_rgba(8,54,69,0.3)]">
      <div class="mb-4 flex items-center gap-2.5">
        <img src="img/r3.jpg" alt="" class="h-9 w-9 rounded-full object-cover" />
        <p class="text-sm font-semibold text-twilight">Laura Fernández</p>
      </div>

      <div class="flex h-14 items-center gap-3 rounded-full bg-cream p-1.5">
        @if (state() !== 'done') {
          <button
            type="button"
            class="relative flex h-11 shrink-0 items-center justify-center rounded-full bg-star text-white transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] touch-none select-none"
            [class]="state() === 'rec' ? (cancelling() ? 'w-11 bg-red-500' : 'w-11') : 'w-11'"
            (pointerdown)="start($event)"
            (pointermove)="move($event)"
            (pointerup)="end()"
            (pointercancel)="end()"
            [style.transform]="state() === 'rec' ? 'translateX(' + dx() + 'px)' : 'none'"
            aria-label="Grabar nota de voz"
          >
            @if (state() === 'rec') {
              <span class="absolute inset-0 animate-ping rounded-full bg-star/40"></span>
            }
            <ion-icon [name]="cancelling() ? 'trash-outline' : 'mic-outline'" class="relative text-xl"></ion-icon>
          </button>
          <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden" aria-hidden="true">
            @if (state() === 'rec') {
              @for (b of live(); track $index) {
                <span class="w-1 shrink-0 rounded-full bg-twilight transition-[height] duration-100" [style.height.px]="b"></span>
              }
            } @else {
              <span class="px-2 text-xs text-muted">{{ d().hold }}</span>
            }
          </div>
          <span class="pr-3 text-xs font-semibold tabular-nums text-twilight">
            @if (state() === 'rec') {
              {{ clock() }}
            }
          </span>
        } @else {
          <button type="button" (click)="toggle()" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-twilight text-white" [attr.aria-label]="playing() ? 'Pausa' : 'Reproducir'">
            <ion-icon [name]="playing() ? 'pause' : 'play'" class="text-lg"></ion-icon>
          </button>
          <div class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-0.5" (click)="scrub($event)" role="slider" [attr.aria-valuenow]="progress()">
            @for (b of clip(); track $index) {
              <span class="w-1 shrink-0 rounded-full transition-colors duration-150" [class]="$index / clip().length < progress() ? 'bg-star' : 'bg-twilight/25'" [style.height.px]="b"></span>
            }
          </div>
          <span class="pr-3 text-xs font-semibold tabular-nums text-twilight">{{ clock() }}</span>
        }
      </div>

      <p class="mt-3 min-h-4 text-center text-xs text-muted">
        @if (state() === 'idle') {
          {{ d().slide }}
        } @else if (state() === 'rec') {
          {{ cancelling() ? d().discard : d().release }}
        } @else {
          <span class="inline-flex items-center gap-1.5 font-medium text-twilight">
            <ion-icon name="checkmark-circle" class="text-star"></ion-icon>{{ d().sent }}
          </span>
          <button type="button" (click)="reset()" class="ml-2 font-semibold text-star hover:underline">{{ d().again }}</button>
        }
      </p>
    </div>
  `,
})
export class DemoVoiceComponent implements OnDestroy {
  private readonly t = inject(TranslationStore).c;
  protected readonly d = computed(() => this.t().features.demo.voice);

  protected readonly state = signal<VoiceState>('idle');
  protected readonly dx = signal(0);
  protected readonly cancelling = signal(false);
  protected readonly live = signal<number[]>([]);
  protected readonly clip = signal<number[]>([]);
  protected readonly seconds = signal(0);
  protected readonly playing = signal(false);
  protected readonly progress = signal(0);

  protected readonly clock = computed(() => {
    const s = this.state() === 'done' ? Math.round(this.seconds() * (this.playing() || this.progress() > 0 ? 1 - this.progress() : 1)) : Math.floor(this.seconds());
    return `0:${String(Math.max(s, 0)).padStart(2, '0')}`;
  });

  private startX = 0;
  private recTimer?: ReturnType<typeof setInterval>;
  private playTimer?: ReturnType<typeof setInterval>;
  private startedAt = 0;

  ngOnDestroy(): void {
    clearInterval(this.recTimer);
    clearInterval(this.playTimer);
  }

  protected start(e: PointerEvent): void {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.startX = e.clientX;
    this.dx.set(0);
    this.cancelling.set(false);
    this.live.set([]);
    this.seconds.set(0);
    this.startedAt = performance.now();
    this.state.set('rec');
    this.recTimer = setInterval(() => {
      this.seconds.set((performance.now() - this.startedAt) / 1000);
      this.live.update((bars) => [...bars, 6 + Math.random() * 24].slice(-26));
    }, 110);
  }

  protected move(e: PointerEvent): void {
    if (this.state() !== 'rec') return;
    const dx = Math.min(0, Math.max(-120, e.clientX - this.startX));
    this.dx.set(dx);
    this.cancelling.set(dx < -70);
  }

  protected end(): void {
    if (this.state() !== 'rec') return;
    clearInterval(this.recTimer);
    if (this.cancelling() || this.seconds() < 0.6) {
      this.state.set('idle');
      this.dx.set(0);
      this.cancelling.set(false);
      return;
    }
    this.clip.set(Array.from({ length: 30 }, () => 6 + Math.random() * 24));
    this.seconds.set(Math.max(1, Math.round(this.seconds())));
    this.progress.set(0);
    this.state.set('done');
  }

  protected toggle(): void {
    if (this.playing()) {
      this.pause();
      return;
    }
    if (this.progress() >= 1) this.progress.set(0);
    this.playing.set(true);
    const step = 100 / (this.seconds() * 1000);
    this.playTimer = setInterval(() => {
      const next = this.progress() + step;
      if (next >= 1) {
        this.progress.set(1);
        this.pause();
      } else {
        this.progress.set(next);
      }
    }, 100);
  }

  private pause(): void {
    clearInterval(this.playTimer);
    this.playing.set(false);
  }

  protected scrub(e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.progress.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  }

  protected reset(): void {
    this.pause();
    this.progress.set(0);
    this.state.set('idle');
  }
}
