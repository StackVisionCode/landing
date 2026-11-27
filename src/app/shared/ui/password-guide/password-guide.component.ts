import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { PasswordGuideRule } from '@core/auth/password-guide';

/**
 * Checklist en vivo de la contraseña nueva (○ → ✓), con los textos del i18n de la landing (en/es); mismas reglas y
 * copy que el CRM y el portal. Las reglas las calcula la pantalla con `passwordGuideRules()` (@core/auth/password-guide)
 * y con `passwordGuideMet()` habilita el envío.
 *
 * Inputs: `rules`, `guideId` (para el aria-describedby del campo), `serverError` (rechazo del backend junto al campo).
 * Uso: `<app-password-guide guideId="password-guide" [rules]="guide()" [serverError]="passwordError()" />`
 */
@Component({
  selector: 'app-password-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div [id]="guideId()" class="mt-1.5">
      <ul class="grid gap-1" [attr.aria-label]="t().pgListLabel">
        @for (rule of rules(); track rule.id) {
          <li
            class="flex items-start gap-1.5 text-xs"
            [attr.data-rule]="rule.id"
            [attr.data-met]="rule.met"
            [class.text-twilight]="rule.met"
            [class.text-muted]="!rule.met"
          >
            <ion-icon
              [name]="rule.met ? 'checkmark-circle' : 'ellipse-outline'"
              aria-hidden="true"
              class="mt-px shrink-0 text-sm"
              [class.text-emerald-600]="rule.met"
              [class.text-muted]="!rule.met"
            ></ion-icon>
            <span class="tabular-nums">{{ label(rule) }}</span>
            <span class="sr-only">{{ rule.met ? t().pgMet : t().pgNotMet }}</span>
          </li>
        }
      </ul>
      <p class="sr-only" aria-live="polite">{{ summary() }}</p>
      @if (serverError()) {
        <p role="alert" class="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600">
          <ion-icon
            name="alert-circle-outline"
            aria-hidden="true"
            class="mt-px shrink-0 text-sm"
          ></ion-icon>
          <span>{{ serverError() }}</span>
        </p>
      }
    </div>
  `,
})
export class PasswordGuideComponent {
  protected readonly t = inject(TranslationStore).t;

  readonly rules = input<readonly PasswordGuideRule[]>([]);
  readonly guideId = input('password-guide');
  readonly serverError = input<string | null | undefined>('');

  /** Solo cambia con el conteo: el lector de pantalla no repite en cada tecla. */
  protected readonly summary = computed(() => {
    const rules = this.rules();
    const met = rules.filter((rule) => rule.met).length;
    return met === rules.length
      ? this.t().pgAllMet
      : this.t().pgSummary.replace('{met}', String(met)).replace('{total}', String(rules.length));
  });

  protected label(rule: PasswordGuideRule): string {
    const t = this.t();
    switch (rule.id) {
      case 'length':
        return t.pgLength
          .replace('{count}', String(rule.count ?? 0))
          .replace('{min}', String(rule.min ?? 0));
      case 'maxLength':
        return t.pgMaxLength;
      case 'common':
        return t.pgCommon;
      case 'email':
        return t.pgEmail;
      case 'context':
        return rule.office ? t.pgContextOffice : t.pgContextProduct;
      case 'current':
        return t.pgCurrent;
      case 'match':
        return t.pgMatch;
    }
  }
}
