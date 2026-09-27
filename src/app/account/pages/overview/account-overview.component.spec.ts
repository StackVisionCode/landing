import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountSubscription, TenantLimits } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountOverviewComponent } from './account-overview.component';

const me = {
  id: 'u1',
  name: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  actorType: 'TenantAdmin',
  tenant: { id: 't1', name: 'CoreTaxPro', subDomain: 'coretaxpro' },
  roles: [],
  permissions: ['billing.view'],
};

function subscription(overrides: Partial<AccountSubscription> = {}): AccountSubscription {
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
    seats: { includedInPlan: 5, purchased: 5, total: 10 },
    addOns: [],
    openSeatCheckout: null,
    ...overrides,
  };
}

const limits: TenantLimits = {
  planCode: 'pro',
  maxUsers: 10,
  activeUsers: 7,
  pendingInvitations: 0,
  availableSeats: 3,
};

function downgrade(): NonNullable<AccountSubscription['pendingPlanChange']> {
  return {
    kind: 'Downgrade',
    id: 'p1',
    fromPlanCode: 'pro',
    toPlanCode: 'starter',
    toBillingCycle: null,
    status: 'Scheduled',
    requestedAtUtc: '2026-09-10T00:00:00Z',
    effectiveAtUtc: '2026-10-01T00:00:00Z',
    chargeAmountCents: null,
    chargeCurrency: null,
    checkoutUrl: null,
  };
}

describe('AccountOverviewComponent', () => {
  function create(data: AccountSubscription | null, limitsResult: unknown = of(limits), overrides: object = {}) {
    const api = {
      get: vi.fn(() => (data ? of(data) : throwError(() => new Error('boom')))),
      limits: vi.fn(() => limitsResult),
      cancelPendingPlanChange: vi.fn(() => of(void 0)),
      ...overrides,
    };
    TestBed.configureTestingModule({
      imports: [AccountOverviewComponent],
      providers: [
        provideRouter([]),
        { provide: AccountSubscriptionService, useValue: api },
        { provide: AccountSessionStore, useValue: { me: signal(me) } },
      ],
    });
    const fixture = TestBed.createComponent(AccountOverviewComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, api };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('muestra el plan contratado con su precio y la próxima fecha de cobro', () => {
    const { page, component } = create(subscription());

    expect(page.textContent).toContain('Pro');
    expect(component.priceLabel()).toContain('49');
    expect(component.nextDateLabel()).toContain('2026');
    expect(component.statusTone()).toBe('ok');
  });

  it('compone los asientos usados con el dato de Auth', () => {
    const { component, page } = create(subscription());

    expect(component.seatsLabel()).toBe('7 of 10 seats used');
    expect(component.seatsPercent()).toBe(70);
    expect(page.textContent).toContain('5 included in your plan · 5 purchased');
  });

  // Los asientos usados son de Auth: si no responde, la pantalla sigue mostrando el resto.
  it('sin el dato de Auth muestra el total sin el "usados"', () => {
    const { component } = create(subscription(), throwError(() => new Error('forbidden')));

    expect(component.seatsLabel()).toBe('10 seats');
    expect(component.seatsPercent()).toBeNull();
  });

  it('en prueba avisa cuándo termina, no cuándo se cobra', () => {
    const data = subscription();
    data.plan.status = 'Trialing';
    data.period.trialEndsAtUtc = '2026-09-30T00:00:00Z';

    const { component } = create(data);

    expect(component.statusLabel()).toBe('Trial');
    expect(component.nextDateLabel()).toContain('Trial ends on');
  });

  it('con el acceso bloqueado lo dice y marca el estado en rojo', () => {
    const data = subscription();
    data.plan.status = 'Suspended';
    data.plan.billingAccessBlocked = true;

    const { component, page } = create(data);

    expect(component.statusTone()).toBe('danger');
    expect(page.textContent).toContain('paused until the subscription is up to date');
  });

  it('anuncia el downgrade agendado con su fecha', () => {
    const data = subscription({
      pendingPlanChange: {
        kind: 'Downgrade',
        id: 'p1',
        fromPlanCode: 'pro',
        toPlanCode: 'starter',
        toBillingCycle: null,
        status: 'Scheduled',
        requestedAtUtc: '2026-09-10T00:00:00Z',
        effectiveAtUtc: '2026-10-01T00:00:00Z',
        chargeAmountCents: null,
        chargeCurrency: null,
        checkoutUrl: null,
      },
    });

    const { component } = create(data);

    expect(component.pendingLabel()).toContain('changes to starter');
  });

  it('el downgrade agendado se puede deshacer y el upgrade no', () => {
    const scheduled = create(subscription({ pendingPlanChange: downgrade() }));
    expect(scheduled.component.canUndoPending()).toBe(true);
    expect((scheduled.page.textContent ?? '')).toContain('Undo');

    TestBed.resetTestingModule();
    const awaiting = create(
      subscription({
        pendingPlanChange: { ...downgrade(), kind: 'Upgrade', status: 'AwaitingPayment', effectiveAtUtc: null },
      })
    );
    expect(awaiting.component.canUndoPending()).toBe(false);
  });

  it('deshacer cancela el cambio y vuelve a leer la suscripción', () => {
    const { component, api } = create(subscription({ pendingPlanChange: downgrade() }));

    component.undoPendingChange();

    expect(api.cancelPendingPlanChange).toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  // Si el downgrade ya no está, no es un error del usuario: se le dice y se refresca.
  it('si ya no hay nada que deshacer lo explica', () => {
    const gone = new HttpErrorResponse({ status: 404, error: { code: 'PendingDowngrade.NotFound' } });
    const { component } = create(subscription({ pendingPlanChange: downgrade() }), of(limits), {
      cancelPendingPlanChange: vi.fn(() => throwError(() => gone)),
    });

    component.undoPendingChange();

    expect(component.undoError()).toBe('There is no scheduled change to undo any more.');
  });

  // Aceptación de la fase: un módulo que el plan ya trae se ve como incluido, no como algo que comprar.
  it('marca como incluido el add-on que el plan ya cubre y con precio el que no', () => {
    const data = subscription({
      addOns: [
        { code: 'email.addon', name: 'Email', modules: ['email'], description: '', category: 'module', eligibility: 'Included', unitAmountCents: 2900, currency: 'USD', tenantAddOnId: null, currentPeriodEndUtc: null, autoRenew: null },
        { code: 'sms.addon', name: 'SMS', modules: ['sms'], description: '', category: 'module', eligibility: 'Available', unitAmountCents: 1500, currency: 'USD', tenantAddOnId: null, currentPeriodEndUtc: null, autoRenew: null },
      ],
    });

    const { component, page } = create(data);

    expect(component.addOnStatusLabel(data.addOns[0])).toBe('Included in your plan');
    expect(component.addOnDetail(data.addOns[0])).toBe(''); // incluido: no se le pone precio de compra
    expect(component.addOnDetail(data.addOns[1])).toContain('15');
    expect(page.textContent).toContain('Included in your plan');
  });

  it('si la suscripción no carga, ofrece reintentar', () => {
    const { component, page, api } = create(null);

    expect(component.failed()).toBe(true);
    expect(page.textContent).toContain('Try again');

    component.load();
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
