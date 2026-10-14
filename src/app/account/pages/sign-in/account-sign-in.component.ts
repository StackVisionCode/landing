import {
  AfterViewInit,
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SITE_CONFIG, PLATFORM_BRAND } from '@core/config/site-config';
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
  styleUrl: './account-sign-in.component.css',
})
export class AccountSignInComponent implements AfterViewInit, OnDestroy {
  /** Marca de la plataforma (site-config), nunca escrita en el template. */
  protected readonly brand = PLATFORM_BRAND;

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
  /** Copy del landing (historia de la pantalla: pendientes → resueltos, línea de confianza). */
  readonly c = this.i18n.c;
  readonly lang = this.i18n.lang;
  readonly story = computed(() => this.c().hero.story);
  readonly before = ['img/a1.jpg', 'img/a2.jpg', 'img/a3.jpg', 'img/a4.jpg'];
  readonly after = ['img/r1.jpg', 'img/r2.jpg', 'img/r3.jpg', 'img/r4.jpg'];
  readonly rows = [0, 1, 2, 3];
  /** Qué cliente va en cada posición de la columna derecha: distinto orden que la izquierda, para que los hilos se crucen. */
  readonly rightOrder = [2, 0, 3, 1];

  @ViewChild('stage') private stageRef?: ElementRef<HTMLElement>;
  @ViewChildren('tagEl') private tagEls?: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('rowEl') private rowEls?: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('pillEl') private pillEls?: QueryList<ElementRef<HTMLElement>>;
  private readonly platformId = inject(PLATFORM_ID);
  private resizeObserver?: ResizeObserver;
  private layoutTimer?: ReturnType<typeof setTimeout>;

  /** Hilos medidos sobre el layout real: de la burbuja del pendiente a la tarjeta de su cliente resuelto. */
  readonly threads = signal<{ i: number; d: string; delay: number }[]>([]);

  /** Retardo del ciclo de cada hilo (s): escalonado para que atrapen uno tras otro. */
  threadDelay(i: number): number {
    return 2.4 + i * 1.5;
  }
  readonly workspaceUrl = SITE_CONFIG.appUrl;

  readonly step = signal<Step>('credentials');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly email = signal('');
  readonly password = signal('');
  readonly passwordVisible = signal(false);
  readonly mfaCode = signal('');
  /** "No volver a pedirme el código en este navegador". Solo aplica si el código es del autenticador. */
  readonly rememberDevice = signal(false);

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

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || typeof ResizeObserver === 'undefined' || !this.stageRef) return;
    // Las tarjetas entran con una animación: se mide cuando ya están en su sitio, y de nuevo si cambia el tamaño.
    this.layoutTimer = setTimeout(() => this.measureThreads(), 1900);
    this.resizeObserver = new ResizeObserver(() => this.measureThreads());
    this.resizeObserver.observe(this.stageRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.cooldown.stop();
    clearTimeout(this.layoutTimer);
    this.resizeObserver?.disconnect();
  }

  private measureThreads(): void {
    const stage = this.stageRef?.nativeElement;
    const tags = this.tagEls?.toArray();
    const rows = this.rowEls?.toArray();
    const pills = this.pillEls?.toArray();
    if (!stage || !tags || !rows || !pills || window.innerWidth < 1024) {
      this.threads.set([]);
      return;
    }
    const origin = stage.getBoundingClientRect();
    const out: { i: number; d: string; delay: number }[] = [];
    for (const i of this.rows) {
      const slot = this.rightOrder.indexOf(i);
      const row = rows[i]?.nativeElement.getBoundingClientRect();
      const tag = tags[i]?.nativeElement.getBoundingClientRect();
      const pill = pills[slot]?.nativeElement.getBoundingClientRect();
      if (!row || !tag || !pill) continue;
      const x1 = tag.right - origin.left + 4;
      const y1 = row.top + row.height / 2 - origin.top;
      const x2 = pill.left - origin.left - 4;
      const y2 = pill.top + pill.height / 2 - origin.top;
      const dx = (x2 - x1) / 2;
      out.push({
        i,
        d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        delay: this.threadDelay(i),
      });
    }
    this.threads.set(out);
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

  toggleLang(): void {
    this.i18n.toggle();
  }

  togglePassword(): void {
    this.passwordVisible.update(visible => !visible);
  }

  chooseOffice(tenantId: string): void {
    this.chosenTenantId.set(tenantId);
    this.mfaCode.set('');
    // Cambiar de oficina reinicia la decisión: se marca para ESTA, no para la anterior.
    this.rememberDevice.set(false);
    this.error.set(null);
  }

  submitOffice(): void {
    if (!this.canSubmitOffice() || !this.sessionRef) return;
    this.begin();

    this.central
      .handoff(
        this.sessionRef,
        this.chosenTenantId()!,
        this.needsCode() ? this.mfaCode().trim() : null,
        this.needsCode() && this.rememberDevice()
      )
      .subscribe({
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
    this.rememberDevice.set(false);
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
