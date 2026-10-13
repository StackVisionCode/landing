import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslationStore } from '@core/i18n/translation.store';

/** Firma con trazo que se afina con la velocidad; al pausar queda "Firmado" (inspirado en Bencho · Signature pad). */
@Component({
  selector: 'app-demo-signature',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="w-full max-w-[380px] rounded-2xl bg-white p-4 shadow-[0_20px_50px_rgba(8,54,69,0.3)]">
      <div class="mb-3 flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-star text-white"><ion-icon name="document-text-outline"></ion-icon></span>
        <p class="truncate text-sm font-semibold text-twilight">{{ d().doc }}</p>
      </div>
      <div class="relative overflow-hidden rounded-xl border border-dashed border-line bg-cream">
        <canvas
          #pad
          class="block h-[150px] w-full touch-none cursor-crosshair transition-opacity duration-500"
          [class.opacity-0]="clearing()"
          (pointerdown)="down($event)"
          (pointermove)="move($event)"
          (pointerup)="up()"
          (pointercancel)="up()"
          (pointerleave)="up()"
        ></canvas>
        @if (!hasInk()) {
          <p class="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted">{{ d().label }}</p>
        }
        <span class="pointer-events-none absolute inset-x-5 bottom-8 h-px bg-line"></span>
        <span
          class="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-lime px-2.5 py-1 text-xs font-semibold text-twilight transition-all duration-500"
          [class]="signed() ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'"
        >
          <ion-icon name="checkmark-circle"></ion-icon>
          {{ d().signed }}
        </span>
      </div>
      <button type="button" (click)="clear()" class="mt-3 text-xs font-semibold text-star hover:underline">{{ d().clear }}</button>
    </div>
  `,
})
export class DemoSignatureComponent implements AfterViewInit, OnDestroy {
  private readonly t = inject(TranslationStore).c;
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly d = computed(() => this.t().features.demo.sign);

  @ViewChild('pad') private padRef?: ElementRef<HTMLCanvasElement>;
  protected readonly hasInk = signal(false);
  protected readonly signed = signal(false);
  protected readonly clearing = signal(false);

  private ctx?: CanvasRenderingContext2D;
  private drawing = false;
  private last = { x: 0, y: 0, t: 0, w: 3 };
  private timer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || !this.padRef) return;
    const canvas = this.padRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#083645';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.ctx = ctx;
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  protected down(e: PointerEvent): void {
    if (!this.ctx) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    clearTimeout(this.timer);
    this.signed.set(false);
    this.drawing = true;
    const p = this.pos(e);
    this.last = { ...p, t: performance.now(), w: 3 };
    this.hasInk.set(true);
  }

  protected move(e: PointerEvent): void {
    if (!this.drawing || !this.ctx) return;
    const p = this.pos(e);
    const now = performance.now();
    const dist = Math.hypot(p.x - this.last.x, p.y - this.last.y);
    const speed = dist / Math.max(now - this.last.t, 1);
    // Más rápido → más fino; más lento → la tinta se acumula.
    const target = Math.min(5.5, Math.max(1.3, 5.5 - speed * 2.2));
    const w = this.last.w + (target - this.last.w) * 0.3;
    this.ctx.lineWidth = w;
    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.last = { ...p, t: now, w };
  }

  protected up(): void {
    if (!this.drawing) return;
    this.drawing = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.signed.set(true), 700);
  }

  protected clear(): void {
    if (!this.ctx || !this.padRef) return;
    clearTimeout(this.timer);
    this.signed.set(false);
    this.clearing.set(true);
    setTimeout(() => {
      const c = this.padRef!.nativeElement;
      this.ctx!.clearRect(0, 0, c.width, c.height);
      this.hasInk.set(false);
      this.clearing.set(false);
    }, 450);
  }
}
