import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Marco común del alta (/register, /register/payment-received, /register/complete):
 * panel Twilight con los 4 pasos a la izquierda en escritorio, cabecera compacta con
 * barra de avance en móvil, y el formulario sobre crema. `step` es el paso actual (1–4).
 */
@Component({
  selector: 'app-register-shell',
  imports: [RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="flex min-h-screen flex-col bg-cream font-sans text-twilight lg:flex-row">
      <aside class="hidden w-[520px] shrink-0 flex-col justify-between bg-twilight p-14 text-white lg:flex xl:w-[560px]">
        <a routerLink="/" class="font-display text-2xl font-extrabold tracking-tight">Tax<span class="text-azure">offix</span></a>

        <div class="space-y-9">
          <h1 class="font-display text-4xl font-semibold leading-[1.12] tracking-tight">{{ t().regShellHeadline }}</h1>
          <ol class="space-y-4">
            @for (label of labels(); track $index) {
              <li class="flex items-center gap-3">
                @if ($index + 1 < step()) {
                  <span class="flex h-7 w-7 items-center justify-center rounded-full bg-azure text-twilight">
                    <ion-icon name="checkmark" class="text-sm"></ion-icon>
                  </span>
                  <span class="text-[15px] text-azure">{{ label }}</span>
                } @else if ($index + 1 === step()) {
                  <span class="flex h-7 w-7 items-center justify-center rounded-full bg-lime text-[13px] font-bold text-twilight">{{ $index + 1 }}</span>
                  <span class="text-[15px] font-semibold text-white">{{ label }}</span>
                } @else {
                  <span class="flex h-7 w-7 items-center justify-center rounded-full border border-azure/70 text-[13px] text-azure">{{ $index + 1 }}</span>
                  <span class="text-[15px] text-azure">{{ label }}</span>
                }
              </li>
            }
          </ol>
        </div>

        <p class="text-[13px] text-azure">{{ footnote() || t().regPanelFootnote }}</p>
      </aside>

      <header class="bg-twilight px-6 pb-5 pt-8 text-white lg:hidden">
        <div class="flex items-center justify-between">
          <a routerLink="/" class="font-display text-xl font-extrabold tracking-tight">Tax<span class="text-azure">offix</span></a>
          <span class="text-xs font-semibold text-lime">{{ counter() }}</span>
        </div>
        <div class="mt-4 flex gap-1.5" aria-hidden="true">
          @for (n of [1, 2, 3, 4]; track n) {
            <span class="h-1 flex-1 rounded-full" [class.bg-lime]="n <= step()" [class.bg-star]="n > step()"></span>
          }
        </div>
        <p class="mt-3 text-[13px] text-azure">{{ labels()[step() - 1] }}</p>
      </header>

      <main class="flex flex-1 items-center justify-center px-6 py-10 lg:p-14">
        <div class="w-full max-w-[420px]">
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class RegisterShellComponent {
  protected readonly t = inject(TranslationStore).t;

  readonly step = input.required<number>();
  readonly footnote = input('');

  protected readonly labels = computed(() => [
    this.t().regStepVerify,
    this.t().regStepDetails,
    this.t().regStepPayment,
    this.t().regStepOffice,
  ]);
  protected readonly counter = computed(() => this.t().regStepCounter.replace('{n}', String(this.step())));
}
