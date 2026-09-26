import { CUSTOM_ELEMENTS_SCHEMA, Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SITE_CONFIG } from '@core/config/site-config';
import { TranslationStore } from '@core/i18n/translation.store';
import { apiErrorCode } from '@core/http/api-error';
import { ActionCooldown } from '@core/http/action-cooldown';
import { formatClock, readThrottle } from '@core/http/throttling';
import { safeAccountReturnUrl } from '@core/auth/account-return-url';
import { AccountSessionStore, AccountSignInOutcome } from '@core/auth/account-session.store';
import { CentralLoginService } from '@core/auth/central-login.service';
import { DiscoverOffice } from '@core/auth/central-login.models';

type Step = 'credentials' | 'office' | 'takeover';

/**
 * Entrada directa al Account, sin pasar por el espacio de trabajo. Son los mismos pasos del login central
 * —contraseña contra todas las oficinas, elegir cuál y resolver el segundo factor— y el último canje abre
 * una sesión de la superficie Account. Como es una sesión nueva, la sesión única manda: si el usuario ya
 * tenía otra abierta, acá se le explica qué se cierra antes de cerrarla.
 */
@Component({
  selector: 'app-account-sign-in',
  imports: [FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './account-sign-in.component.html',
})
export class AccountSignInComponent implements OnDestroy {
  private readonly i18n = inject(TranslationStore);
  private readonly central = inject(CentralLoginService);
  private readonly session = inject(AccountSessionStore);
  private readonly router = inject(Router);
  /** A dónde iba cuando el guard lo mandó acá; si no venía de ningún lado, al resumen. */
  private readonly returnUrl = safeAccountReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  private readonly cooldown = new ActionCooldown();
  private sessionRef: string | null = null;
  private takeoverTicket: string | null = null;

  readonly t = this.i18n.t;
  readonly workspaceUrl = SITE_CONFIG.appUrl;

  readonly step = signal<Step>('credentials');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly email = signal('');
  readonly password = signal('');
  readonly passwordVisible = signal(false);
  readonly mfaCode = signal('');

  readonly offices = signal<DiscoverOffice[]>([]);
  readonly chosenTenantId = signal<string | null>(null);

  readonly waitingSeconds = this.cooldown.secondsLeft;
  readonly waiting = this.cooldown.active;
  readonly waitLabel = computed(() => formatClock(this.waitingSeconds()));

  /** Lo que el Account resuelve, dicho de a una línea: es lo que el panel de marca promete. */
  readonly panelPoints = computed(() => {
    const t = this.t();
    return [t.accSignInPanelPlan, t.accSignInPanelSeats, t.accSignInPanelBilling];
  });

  readonly chosenOffice = computed(() => this.offices().find(office => office.tenantId === this.chosenTenantId()));
  readonly needsCode = computed(() => this.chosenOffice()?.mfaRequired === true);

  readonly canSubmitCredentials = computed(
    () => !this.busy() && !this.waiting() && this.email().trim().length > 0 && this.password().length > 0
  );
  readonly canSubmitOffice = computed(
    () => !this.busy() && !this.waiting() && this.chosenTenantId() !== null && (!this.needsCode() || this.mfaCode().trim().length > 0)
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cooldown.stop());
  }

  ngOnDestroy(): void {
    this.cooldown.stop();
  }

  submitCredentials(): void {
    if (!this.canSubmitCredentials()) return;
    this.begin();

    this.central.discover(this.email().trim(), this.password()).subscribe({
      next: outcome => {
        if (outcome.kind === 'ticket') {
          this.redeem(outcome.ticket);
          return;
        }
        // Las cuentas de cliente no gestionan la suscripción; con `accountKind` no deberían venir.
        const offices = outcome.offices.filter(office => !office.isClientPortal);
        if (offices.length === 0) {
          this.fail(this.t().accSignInAdminOnly);
          return;
        }
        this.sessionRef = outcome.sessionRef;
        this.offices.set(offices);
        this.chosenTenantId.set(offices.length === 1 ? offices[0].tenantId : null);
        this.busy.set(false);
        this.step.set('office');
      },
      error: (err: unknown) => this.fail(this.messageFor(err, this.t().accSignInBadCredentials)),
    });
  }

  togglePassword(): void {
    this.passwordVisible.update(visible => !visible);
  }

  chooseOffice(tenantId: string): void {
    this.chosenTenantId.set(tenantId);
    this.mfaCode.set('');
    this.error.set(null);
  }

  submitOffice(): void {
    if (!this.canSubmitOffice() || !this.sessionRef) return;
    this.begin();

    this.central.handoff(this.sessionRef, this.chosenTenantId()!, this.needsCode() ? this.mfaCode().trim() : null).subscribe({
      next: handoff => this.redeem(handoff.ticket),
      error: (err: unknown) => this.fail(this.messageFor(err, this.t().accSignInBadCode)),
    });
  }

  confirmTakeover(): void {
    if (this.busy() || !this.takeoverTicket) return;
    this.begin();

    this.session.confirmTakeover(this.takeoverTicket).subscribe({
      next: outcome => this.settle(outcome),
      error: (err: unknown) => this.fail(this.messageFor(err, this.t().accSignInExpired)),
    });
  }

  backToCredentials(): void {
    this.sessionRef = null;
    this.takeoverTicket = null;
    this.offices.set([]);
    this.chosenTenantId.set(null);
    this.mfaCode.set('');
    this.password.set('');
    this.passwordVisible.set(false);
    this.error.set(null);
    this.step.set('credentials');
  }

  private redeem(ticket: string): void {
    this.session.startFromLogin(ticket).subscribe({
      next: outcome => this.settle(outcome),
      error: (err: unknown) => this.fail(this.messageFor(err, this.t().accSignInExpired)),
    });
  }

  private settle(outcome: AccountSignInOutcome): void {
    this.busy.set(false);
    if (outcome.kind === 'signed-in') {
      void this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
      return;
    }
    this.takeoverTicket = outcome.ticket;
    this.step.set('takeover');
  }

  private begin(): void {
    this.busy.set(true);
    this.error.set(null);
  }

  private fail(message: string): void {
    this.busy.set(false);
    this.error.set(message);
  }

  /** Un throttle bloquea el botón con la espera real; lo demás es un mensaje según el código. */
  private messageFor(err: unknown, fallback: string): string {
    const throttle = readThrottle(err);
    if (throttle) {
      this.cooldown.start(throttle.retryAfterSeconds);
      return throttle.kind === 'overloaded' ? this.t().accSignInBusy : this.t().accSignInTooMany;
    }
    const t = this.t();
    switch (apiErrorCode(err)) {
      case 'Auth.AccountAdminOnly':
        return t.accSignInAdminOnly;
      case 'Auth.AccountMfaSetupRequired':
        return t.accSignInMfaSetup;
      case 'Auth.HandoffInvalid':
        return t.accSignInExpired;
      default:
        return fallback;
    }
  }
}
