import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PLATFORM_BRAND } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';
import type { BookingEntrySource } from '@core/public-booking/public-booking.models';
import { DemoBookingService } from '@landing/demo-booking.service';
import { BookingFlowComponent } from './booking-flow.component';

const SOURCES: readonly BookingEntrySource[] = ['Direct', 'Hero', 'Benefits', 'Team', 'Faq', 'Cta'];

export { demoLeaveGuard } from '@landing/demo-booking.service';

/**
 * `/demo`: "Book a live demo" a pantalla completa (DEMO-11). Página y no modal: Atrás funciona, el enlace se
 * comparte y nada se cierra por un clic perdido. El botón que la abrió llega en el estado de la navegación.
 */
@Component({
  selector: 'app-demo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BookingFlowComponent],
  template: `
    <div class="flex min-h-screen flex-col bg-cream font-sans text-twilight">
      <header class="sticky top-0 z-20 border-b border-line bg-white/80 backdrop-blur-md">
        <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a routerLink="/" class="flex items-center gap-2" [attr.aria-label]="brand">
            <img src="img/logo-mark.png" alt="" class="h-7 w-auto" />
            <span
              class="ml-0.5 font-display text-[22px] font-extrabold tracking-tight text-twilight"
              >Tax<span class="text-star">offix</span></span
            >
          </a>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="min-h-11 rounded-full border border-line bg-white px-3 text-xs font-semibold"
              (click)="translation.toggle()"
            >
              {{ translation.lang() === 'es' ? 'EN' : 'ES' }}
            </button>
            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-xl leading-none hover:border-twilight/40"
              [attr.aria-label]="translation.c().demoBooking.close"
              (click)="home()"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      </header>
      <main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <app-booking-flow [source]="source" (done)="home()" />
      </main>
    </div>

    @if (booking.leaveRequest()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-twilight/40 p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="demo-leave-title"
          aria-describedby="demo-leave-text"
          class="grid w-full max-w-md gap-3 rounded-[22px] bg-white p-6 shadow-xl"
        >
          <p id="demo-leave-title" class="text-lg font-semibold">
            {{ translation.c().demoBooking.leaveTitle }}
          </p>
          <p id="demo-leave-text" class="text-sm text-muted">
            {{ translation.c().demoBooking.leaveText }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="min-h-11 rounded-full bg-twilight px-5 text-sm font-semibold text-white hover:bg-star"
              (click)="booking.answerLeave(false)"
            >
              {{ translation.c().demoBooking.keepBooking }}
            </button>
            <button
              type="button"
              class="min-h-11 rounded-full border border-twilight/20 bg-white px-5 text-sm font-semibold"
              (click)="booking.answerLeave(true)"
            >
              {{ translation.c().demoBooking.leave }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DemoPageComponent {
  protected readonly translation = inject(TranslationStore);
  protected readonly booking = inject(DemoBookingService);
  protected readonly brand = PLATFORM_BRAND;
  protected readonly source = readSource();
  private readonly router = inject(Router);

  protected home(): void {
    void this.router.navigateByUrl('/');
  }

  /** Recargar o cerrar la pestaña con un horario apartado: el navegador pregunta. */
  @HostListener('window:beforeunload', ['$event'])
  protected onUnload(event: BeforeUnloadEvent): void {
    if (this.booking.hasProgress()) {
      event.preventDefault();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.booking.leaveRequest()) {
      this.booking.answerLeave(false);
    }
  }
}

/** El origen viaja en el estado de la navegación; entrar directo a `/demo` es `Direct`. */
function readSource(): BookingEntrySource {
  const state =
    typeof history === 'undefined' ? null : (history.state as { demoSource?: unknown } | null);
  const value = state?.demoSource;
  return SOURCES.includes(value as BookingEntrySource) ? (value as BookingEntrySource) : 'Direct';
}
