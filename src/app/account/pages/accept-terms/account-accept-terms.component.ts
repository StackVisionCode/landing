import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AccountTermsService } from '@core/account/account-terms.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';

/**
 * Gate de términos del Account del landing. El backend bloquea con 409 `Terms.NotAccepted` toda
 * request autenticada cuando el tenant no aceptó la versión vigente del ToS; esta pantalla deja al
 * admin aceptar sin salir del landing. Mismo patrón que `TermsPageComponent` del CRM, versión
 * mínima (sin visor inline — el link abre el documento en una pestaña nueva).
 */
@Component({
  selector: 'app-account-accept-terms',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <section class="mx-auto flex min-h-[80vh] max-w-2xl flex-col justify-center px-6 py-10">
      <div class="rounded-2xl border border-line bg-white p-8 shadow-sm">
        <h1 class="text-2xl font-semibold tracking-tight text-twilight">{{ t().accTermsTitle }}</h1>
        <p class="mt-2 text-[14px] text-muted">{{ t().accTermsSubtitle }}</p>

        <div class="mt-6 rounded-xl border border-line bg-sand/40 p-4 text-[13px] text-twilight">
          <p>
            {{ t().accTermsReadPrompt }}
            <a [href]="termsUrl" target="_blank" rel="noopener"
              class="font-semibold text-star underline decoration-star/40 underline-offset-2 hover:decoration-star">
              {{ t().accTermsOpenLink }}
            </a>
          </p>
        </div>

        <label class="mt-6 flex items-start gap-3 cursor-pointer">
          <input type="checkbox" class="mt-1 h-4 w-4 rounded border-line accent-star"
            [checked]="agreed()" (change)="toggle()" />
          <span class="text-[13px] text-twilight">{{ t().accTermsCheckboxLabel }}</span>
        </label>

        @if (formError(); as error) {
          <p role="alert" class="mt-3 rounded-lg border border-twilight/30 bg-sand px-3 py-2 text-[13px] font-medium text-twilight">
            {{ error }}
          </p>
        }

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" (click)="accept()" [disabled]="!canAccept()"
            class="rounded-lg bg-twilight px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-star disabled:opacity-60">
            {{ submitting() ? t().accTermsSubmitting : t().accTermsAccept }}
          </button>
          <button type="button" (click)="signOut()" [disabled]="submitting()"
            class="text-[13px] font-semibold text-muted hover:text-twilight disabled:opacity-60">
            {{ t().accTermsSignOut }}
          </button>
        </div>
      </div>
    </section>
  `,
})
export class AccountAcceptTermsComponent {
  private readonly terms = inject(AccountTermsService);
  private readonly session = inject(AccountSessionStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationStore);

  readonly t = this.i18n.t;
  readonly agreed = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  // Link al documento legal publicado en el sitio marketing; mismo patrón que el onboarding del landing.
  readonly termsUrl = `${SITE_CONFIG.websiteUrl}/legal/terms`;

  readonly canAccept = computed(() => this.agreed() && !this.submitting());

  toggle(): void {
    this.agreed.update(v => !v);
    if (this.agreed()) this.formError.set(null);
  }

  accept(): void {
    if (!this.agreed()) {
      this.formError.set(this.t().accTermsNeedsAgreement);
      return;
    }
    this.submitting.set(true);
    this.formError.set(null);
    this.terms.accept().subscribe({
      next: () => {
        this.submitting.set(false);
        // Hard reload: el store conservó `me = null` cuando el /auth/me del login devolvió 409. Con la
        // aceptación grabada el backend ya responde /me correctamente — recargar la raíz del Account
        // vuelve a correr `restore()` y arma el perfil completo. Un router.navigate reutilizaría el
        // store cacheado y el guard volvería a mandar al gate de términos.
        window.location.assign('/account');
      },
      error: () => {
        this.submitting.set(false);
        this.formError.set(this.t().accTermsError);
      },
    });
  }

  signOut(): void {
    this.session.logout().subscribe(() => {
      void this.router.navigate(['/account/sign-in']);
    });
  }
}
