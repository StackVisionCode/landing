import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SITE_CONFIG } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';

/** Por qué no hay Account que mostrar. La ruta elige el texto; el camino de vuelta es siempre el mismo. */
export type AccountNoticeKind = 'no-access' | 'session-ended';

@Component({
  selector: 'app-account-notice',
  templateUrl: './account-notice.component.html',
})
export class AccountNoticeComponent {
  private readonly i18n = inject(TranslationStore);

  readonly t = this.i18n.t;
  readonly workspaceUrl = SITE_CONFIG.appUrl;
  readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as AccountNoticeKind;

  readonly title = computed(() =>
    this.kind === 'no-access' ? this.t().accNoAccessTitle : this.t().accSessionEndedTitle
  );

  readonly body = computed(() =>
    this.kind === 'no-access' ? this.t().accNoAccessBody : this.t().accSessionEndedBody
  );
}
