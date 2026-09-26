import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountSubscription, PlanChangePreview } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { PlanResponse } from '@core/plans/plans.models';
import { PlansService } from '@core/plans/plans.service';
import { AccountPlanComponent } from './account-plan.component';

const me = {
  id: 'u1',
  name: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  actorType: 'TenantAdmin',
  tenant: { id: 't1', name: 'CoreTaxPro', subDomain: 'coretaxpro' },
  roles: [],
  permissions: ['subscription.plan.change'],
};

function plan(code: string, monthly: number, maxUsers: number): PlanResponse {
  return {
    id: code,
    code,
    name: code,
    description: '',
    tier: 'Standard',
    monthlyPriceUsd: monthly,
    supportedBillingCycles: ['Monthly'],
    pricesUsdByCycle: { Monthly: monthly },
    maxUsers,
    maxPendingInvitations: 5,
    storageQuotaBytes: 0,
    enabledModules: ['documents'],
  };
}

function subscription(): AccountSubscription {
  return {
    plan: {
      code: 'pro',
      name: 'Pro',
      status: 'Active',
      billingCycle: 'Monthly',
      currentCyclePriceCents: 4900,
      currency: 'USD',
      enabledModules: ['documents'],
      billingAccessBlocked: false,
    },
    period: {
      currentPeriodStartUtc: '2026-09-01T00:00:00Z',
      currentPeriodEndUtc: '2026-10-01T00:00:00Z',
      nextRenewalAtUtc: '2026-10-01T00:00:00Z',
      trialEndsAtUtc: null,
      gracePeriodEndsAtUtc: null,
      cancelAtPeriodEnd: false,
      cancelledAtUtc: null,
    },
    pendingPlanChange: null,
    seats: { includedInPlan: 10, purchased: 0, total: 10 },
    addOns: [],
    openSeatCheckout: null,
  };
}

function preview(overrides: Partial<PlanChangePreview> = {}): PlanChangePreview {
  return {
    direction: 'Downgrade',
    toPlanCode: 'starter',
    toPlanName: 'starter',
    billingCycle: 'Monthly',
    amountCents: 1900,
    currency: 'USD',
    currentAmountCents: 4900,
    chargedNow: false,
    effectiveAtUtc: '2026-10-01T00:00:00Z',
    seatsAfterChange: 3,
    occupiedSeats: 2,
    blocked: false,
    blockedReason: null,
    ...overrides,
  };
}

describe('AccountPlanComponent', () => {
  function create(overrides: object = {}, queryParam: string | null = null) {
    const api = {
      get: vi.fn(() => of(subscription())),
      planChangePreview: vi.fn(() => of(preview())),
      changePlan: vi.fn(() => of({ status: 'PaymentProcessing', planChangeRequestId: 'r1', checkoutUrl: null })),
      cancelSubscription: vi.fn(() => of(void 0)),
      resumeSubscription: vi.fn(() => of(void 0)),
      ...overrides,
    };
    const plansApi = { getPlans: vi.fn(() => of([plan('pro', 49, 10), plan('starter', 19, 3)])) };
    TestBed.configureTestingModule({
      imports: [AccountPlanComponent],
      providers: [
        { provide: AccountSubscriptionService, useValue: api },
        { provide: PlansService, useValue: plansApi },
        { provide: AccountSessionStore, useValue: { me: signal(me) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => queryParam } } } },
      ],
    });
    const fixture = TestBed.createComponent(AccountPlanComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, api };
  }

  afterEach(() => TestBed.resetTestingModule());

  /**
   * Con el acceso cortado el Account solo decía que estaba bloqueado: quien se quedaba sin acceso tenía que
   * volver al espacio de trabajo a pagar. Ahora la salida está donde se mira.
   */
  it('con el acceso cortado ofrece renovar y sale al pago', () => {
    const blocked = subscription();
    blocked.plan.billingAccessBlocked = true;
    const startRenewCheckout = vi.fn(() =>
      of({ renewalIntentId: 'r1', checkoutUrl: 'https://pay/renew', paymentId: 'p1', expiresAtUtc: '2026-10-01T00:00:00Z' })
    );
    const assign = vi.fn();
    vi.stubGlobal('location', { origin: 'https://site', assign, href: 'https://site/account/plan' });

    const { component, page } = create({ get: vi.fn(() => of(blocked)), startRenewCheckout });

    expect(component.needsRenewal()).toBe(true);
    expect(page.textContent).toContain(component.t().accRenewCta);

    component.renew();

    expect(startRenewCheckout).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith('https://pay/renew');
    vi.unstubAllGlobals();
  });

  it('con el acceso al día no ofrece renovar', () => {
    const { component, page } = create();

    expect(component.needsRenewal()).toBe(false);
    expect(page.textContent).not.toContain(component.t().accRenewCta);
  });


  it('lista los planes de más barato a más caro y marca el contratado', () => {
    const { component, page } = create();

    expect(component.plans().map(p => p.code)).toEqual(['starter', 'pro']);
    expect(component.isCurrent(component.plans()[1])).toBe(true);
    expect(page.textContent).toContain('Your plan');
  });

  // Nada se pide sin ver antes qué pasaría: el total y la fecha los calcula el backend.
  it('elegir un plan pide la vista previa antes de cambiar nada', () => {
    const { component, api } = create();

    component.choose(component.plans()[0]);

    expect(api.planChangePreview).toHaveBeenCalledWith('starter', 'Monthly');
    expect(api.changePlan).not.toHaveBeenCalled();
    expect(component.previewLabel()).toContain('You keep your current plan until');
  });

  it('la vista previa de un upgrade dice el total que se cobra ahora', () => {
    const { component } = create({
      planChangePreview: vi.fn(() =>
        of(preview({ direction: 'Upgrade', chargedNow: true, effectiveAtUtc: null, amountCents: 4900 }))
      ),
    });

    component.choose(component.plans()[0]);

    expect(component.previewLabel()).toContain('charged $49.00 now');
  });

  // Aceptación de la fase: un downgrade que no entra se explica y se bloquea.
  it('un downgrade que no entra se explica y no se puede confirmar', () => {
    const { component, api, fixture } = create({
      planChangePreview: vi.fn(() =>
        of(preview({ blocked: true, blockedReason: 'Subscription.DowngradeExceedsSeats', occupiedSeats: 8 }))
      ),
    });

    component.choose(component.plans()[0]);
    fixture.detectChanges();
    component.confirm();

    expect(api.changePlan).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("That plan doesn't fit your office yet");
  });

  it('confirmar un downgrade lo agenda y lo dice', () => {
    const { component, api } = create();
    component.choose(component.plans()[0]);

    component.confirm();

    expect(api.changePlan).toHaveBeenCalledWith(
      expect.objectContaining({ planCode: 'starter', billingCycle: 'Monthly', payerEmail: null })
    );
    expect(component.outcome()).toBe('Done. Your plan changes at the end of the current period.');
  });

  // El backend exige confirmar la contraseña para cambiar de plan (D5).
  it('si el backend pide confirmar la contraseña, muestra el diálogo', () => {
    const stepUp = new HttpErrorResponse({ status: 401, error: { code: 'Auth.ReauthenticationRequired' } });
    const { component } = create({ changePlan: vi.fn(() => throwError(() => stepUp)) });
    component.choose(component.plans()[0]);

    component.confirm();

    expect(component.stepUpNeeded()).toBe(true);
    expect(component.error()).toBeNull();
  });

  // Sin método en archivo el upgrade se paga por redirect: la pantalla manda al proveedor.
  it('confirmar un upgrade manda a pagar al proveedor', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, origin: 'https://app.test', assign });
    const { component, api } = create({
      planChangePreview: vi.fn(() => of(preview({ direction: 'Upgrade', chargedNow: true, effectiveAtUtc: null }))),
      changePlan: vi.fn(() =>
        of({ status: 'PaymentProcessing', planChangeRequestId: 'r1', checkoutUrl: 'https://pay/upgrade' })
      ),
    });
    component.choose(component.plans()[0]);

    component.confirm();

    expect(api.changePlan).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: 'ada@example.com', successUrl: expect.stringContaining('checkout=success') })
    );
    expect(assign).toHaveBeenCalledWith('https://pay/upgrade');
    vi.unstubAllGlobals();
  });

  it('un upgrade a medio pagar se puede retomar', () => {
    const pending = {
      kind: 'Upgrade' as const,
      id: 'r1',
      fromPlanCode: 'starter',
      toPlanCode: 'pro',
      toBillingCycle: null,
      status: 'AwaitingPayment',
      requestedAtUtc: '2026-09-25T00:00:00Z',
      effectiveAtUtc: null,
      chargeAmountCents: 4900,
      chargeCurrency: 'USD',
      checkoutUrl: 'https://pay/resume',
    };
    const { component, page } = create({
      get: vi.fn(() => of({ ...subscription(), pendingPlanChange: pending })),
    });

    expect(component.openUpgrade()).toBe('https://pay/resume');
    expect(page.textContent).toContain('Finish payment');
  });

  it('al volver del proveedor tras pagar avisa que lo está aplicando', () => {
    const { component, page } = create({}, 'success');

    expect(component.checkoutOutcome()).toBe('paid');
    expect(page.textContent).toContain("We're applying your new plan");
  });

  // Aceptación de la fase: cancelar hoy mantiene el acceso hasta el fin del período y no reembolsa.
  it('cancelar avisa hasta cuándo llega el acceso y no corta nada', () => {
    const { component, page, api } = create();

    component.openCancel();
    component.cancelReason.set('too expensive');
    component.confirmCancel();

    expect(api.cancelSubscription).toHaveBeenCalledWith('too expensive');
    expect(component.outcome()).toContain('Your subscription will end on');
    expect(page.textContent).toContain('No refund is issued.');
  });

  // El backend exige confirmar la contraseña también para cancelar (D5).
  it('si el backend pide la contraseña para cancelar, muestra el diálogo y reintenta lo mismo', () => {
    const stepUp = new HttpErrorResponse({ status: 401, error: { code: 'Auth.ReauthenticationRequired' } });
    const cancelSubscription = vi.fn(() => throwError(() => stepUp));
    const { component } = create({ cancelSubscription });
    component.openCancel();

    component.confirmCancel();

    expect(component.stepUpNeeded()).toBe(true);
    expect(component.cancelError()).toBeNull();

    component.onStepUpConfirmed();
    expect(cancelSubscription).toHaveBeenCalledTimes(2);
  });

  // Aceptación de la fase: "Resume" lo revierte sin cobro.
  it('con la cancelación agendada se ofrece conservarla y deshacerlo', () => {
    const scheduled = subscription();
    scheduled.period.cancelAtPeriodEnd = true;
    const { component, page, api } = create({ get: vi.fn(() => of(scheduled)) });

    expect(component.cancelScheduled()).toBe(true);
    expect(page.textContent).toContain('Your subscription ends on');

    component.resume();

    expect(api.resumeSubscription).toHaveBeenCalled();
    expect(component.outcome()).toBe('Your subscription continues as normal.');
  });

  it('el plan que ya tiene no se puede elegir', () => {
    const { component, api } = create();

    component.choose(component.plans()[1]);

    expect(api.planChangePreview).not.toHaveBeenCalled();
    expect(component.error()).toBe("That's the plan you already have.");
  });
});
