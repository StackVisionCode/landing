import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { BookingEntrySource } from '@core/public-booking/public-booking.models';

/** Guard de `/demo`: con un horario elegido o datos escritos, pregunta antes de salir (también con Atrás). */
export function demoLeaveGuard(): boolean | Promise<boolean> {
  return inject(DemoBookingService).confirmLeave();
}

/** Botones del landing que abren "Book a live demo". */
export type DemoButton = 'hero' | 'benefits' | 'team' | 'faq' | 'cta';

const SOURCES: Record<DemoButton, BookingEntrySource> = {
  hero: 'Hero',
  benefits: 'Benefits',
  team: 'Team',
  faq: 'Faq',
  cta: 'Cta',
};

/**
 * "Book a live demo" es la página `/demo` (DEMO-11): los botones navegan con su origen en el estado de la
 * navegación, así la URL queda limpia y se puede compartir. Lleva también si hay algo que se perdería al salir.
 */
@Injectable({ providedIn: 'root' })
export class DemoBookingService {
  private readonly router = inject(Router);

  /** El flujo tiene algo que se perdería al salir (horario elegido, datos, código pendiente). */
  readonly hasProgress = signal(false);
  /** Pregunta abierta de "¿salir sin agendar?"; la página la muestra y la responde. */
  readonly leaveRequest = signal<((leave: boolean) => void) | null>(null);

  open(button: DemoButton = 'hero'): void {
    void this.router.navigate(['/demo'], { state: { demoSource: SOURCES[button] } });
  }

  /** Sin avance se sale directo; con avance, la página pregunta y responde por `answerLeave`. */
  confirmLeave(): boolean | Promise<boolean> {
    if (!this.hasProgress()) {
      return true;
    }
    return new Promise<boolean>((resolve) => this.leaveRequest.set(resolve));
  }

  answerLeave(leave: boolean): void {
    const resolve = this.leaveRequest();
    this.leaveRequest.set(null);
    if (leave) {
      this.hasProgress.set(false);
    }
    resolve?.(leave);
  }
}
