import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AccountSessionExpiryService } from '@core/auth/account-session-expiry.service';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Aviso de inactividad del Account. Bloqueante (`alertdialog`): o se sigue conectado o se cierra la sesión; la
 * cuenta atrás y la barra usan los segundos de la política de la plataforma.
 */
@Component({
  selector: 'app-account-idle-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().show) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-twilight/40 px-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="account-idle-title"
          aria-describedby="account-idle-body"
          class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        >
          <h2 id="account-idle-title" class="text-lg font-semibold text-twilight">{{ t().accIdleTitle }}</h2>
          <p id="account-idle-body" class="mt-2 text-sm text-muted">{{ t().accIdleBody }}</p>
          <p class="mt-4 font-mono text-3xl font-semibold tabular-nums text-twilight" aria-live="off">{{ clock() }}</p>
          <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              class="h-full rounded-full transition-[width] duration-1000 ease-linear"
              [class]="state().remainingSeconds <= 15 ? 'bg-red-500' : 'bg-amber-400'"
              [style.width.%]="progress()"
            ></div>
          </div>
          <div class="mt-6 flex gap-3">
            <button
              type="button"
              class="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-twilight"
              (click)="expiry.signOutNow()"
            >
              {{ t().accIdleSignOut }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-xl bg-twilight px-4 py-2.5 text-sm font-semibold text-white"
              (click)="expiry.stay()"
            >
              {{ t().accIdleStay }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AccountIdleModalComponent {
  protected readonly expiry = inject(AccountSessionExpiryService);
  protected readonly t = inject(TranslationStore).t;
  protected readonly state = this.expiry.state;

  protected readonly progress = computed(() => {
    const { remainingSeconds, totalSeconds } = this.state();
    return totalSeconds > 0 ? Math.min(100, (remainingSeconds / totalSeconds) * 100) : 0;
  });

  protected readonly clock = computed(() => {
    const seconds = Math.max(0, this.state().remainingSeconds);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
}
