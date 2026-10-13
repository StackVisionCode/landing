import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslationStore } from '@core/i18n/translation.store';
import { DemoClientsComponent } from './demos/demo-clients.component';
import { DemoTasksComponent } from './demos/demo-tasks.component';
import { DemoSignatureComponent } from './demos/demo-signature.component';
import { DemoVoiceComponent } from './demos/demo-voice.component';
import { DemoUploadComponent } from './demos/demo-upload.component';
import { DemoPayComponent } from './demos/demo-pay.component';

/**
 * Visor de funciones: lista a la izquierda y, a la derecha, una mini-demo interactiva de la función activa
 * (inspiradas en los bloques de bencho.dev, reescritas en Angular sin framer-motion).
 * Avanza solo (la barra de progreso de la función activa marca el ritmo) y se pausa al pasar el mouse
 * o cuando la sección no está a la vista; elegir una función a mano reinicia el ciclo.
 */
@Component({
  selector: 'app-features-grid',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [DemoClientsComponent, DemoTasksComponent, DemoSignatureComponent, DemoVoiceComponent, DemoUploadComponent, DemoPayComponent],
  templateUrl: './features-grid.component.html',
  styleUrl: './features-grid.component.css',
})
export class FeaturesGridComponent implements AfterViewInit, OnDestroy {
  protected readonly t = inject(TranslationStore).c;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly activeIndex = signal(0);
  protected readonly active = computed(() => this.t().features.items[this.activeIndex()]);
  protected readonly hovered = signal(false);
  protected readonly inView = signal(false);
  /** El visitante tocó una demo: el ciclo automático no la cambia por debajo hasta que elija otra función. */
  protected readonly engaged = signal(false);
  protected readonly playing = computed(() => this.inView() && !this.hovered() && !this.engaged());

  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.observer = new IntersectionObserver(([entry]) => this.inView.set(entry.isIntersecting), { threshold: 0.35 });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  select(index: number): void {
    this.engaged.set(false);
    this.activeIndex.set(index);
  }

  /** Termina la barra de progreso → pasa a la siguiente función. */
  protected next(): void {
    this.engaged.set(false);
    this.activeIndex.update((i) => (i + 1) % this.t().features.items.length);
  }
}
