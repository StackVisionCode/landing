import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountAddOn, AccountSubscription } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountAddOnsComponent } from './account-addons.component';

const me = {
  id: 'u1',
  name: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  actorType: 'TenantAdmin',
  tenant: { id: 't1', name: 'CoreTaxPro', subDomain: 'coretaxpro' },
  roles: [],
  permissions: ['addons.manage'],
};

function addOn(code: string, eligibility: AccountAddOn['eligibility'], overrides: Partial<AccountAddOn> = {}): AccountAddOn {
  return {
    code,
    name: code,
    // El nombre visible sale de `modules` + MODULE_LABELS, no de `name` (que en la base va en español).
    modules: [code.replace('addon-', '').replace('.addon', '')],
    description: '',
    category: 'module',
    eligibility,
    unitAmountCents: 2900,
    currency: 'USD',
    tenantAddOnId: null,
    currentPeriodEndUtc: null,
    autoRenew: null,
    ...overrides,
  };
}

function subscription(addOns: AccountAddOn[]): AccountSubscription {
  return {
    plan: {
      code: 'pro',
      name: 'Pro',
      status: 'Active',
      billingCycle: 'Monthly',
      currentCyclePriceCents: 4900,
      currency: 'USD',
      enabledModules: [],
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
    seats: { includedInPlan: 5, purchased: 0, total: 5 },
    addOns,
    openSeatCheckout: null,
  };
}

describe('AccountAddOnsComponent', () => {
  function create(addOns: AccountAddOn[], queryParam: string | null = null, overrides: object = {}) {
    const api = {
      get: vi.fn(() => of(subscription(addOns))),
      addOnCheckoutStatus: vi.fn(() => of({ addOnPurchaseIntentId: 'i1', status: 'Pending', addOnCode: 'sms.addon', quantity: 1, proratedTotalCents: 2900, currency: 'USD', checkoutUrl: null })),
      startAddOnCheckout: vi.fn(() => of({ addOnPurchaseIntentId: 'i1', checkoutUrl: 'https://pay/x', paymentId: 'p1', expiresAtUtc: '2026-09-26T00:00:00Z' })),
      ...overrides,
    };
    TestBed.configureTestingModule({
      imports: [AccountAddOnsComponent],
      providers: [
        { provide: AccountSubscriptionService, useValue: api },
        { provide: AccountSessionStore, useValue: { me: signal(me) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => queryParam } } } },
      ],
    });
    const fixture = TestBed.createComponent(AccountAddOnsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, api };
  }

  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  // Aceptación de la fase: lo que el plan ya trae no se ofrece comprar.
  it('un add-on incluido en el plan se lista sin botón de compra', () => {
    const { page } = create([addOn('email.addon', 'Included')]);

    expect(page.textContent).toContain('Included in your plan');
    expect(page.querySelectorAll('button').length).toBe(0);
  });

  it('un add-on ya activo se lista sin botón de compra', () => {
    const { page } = create([addOn('sms.addon', 'Active', { currentPeriodEndUtc: '2026-10-01T00:00:00Z', autoRenew: true })]);

    expect(page.textContent).toContain('Active');
    expect(page.querySelectorAll('button').length).toBe(0);
  });

  it('solo lo disponible ofrece comprarlo, con su precio', () => {
    const { component, page } = create([addOn('sms.addon', 'Available')]);

    expect(component.priceLabel(component.available()[0])).toContain('per month');
    expect(page.querySelector('button')?.textContent).toContain('Add to my plan');
  });

  it('comprar lleva al pago del proveedor', () => {
    const { component, api } = create([addOn('sms.addon', 'Available')]);

    component.buy(component.available()[0]);

    expect(api.startAddOnCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ addOnCode: 'sms.addon', quantity: 1, autoRenew: true, payerEmail: 'ada@example.com' })
    );
  });

  it('no intenta comprar lo que el backend no marca como disponible', () => {
    const { component, api } = create([addOn('email.addon', 'Included')]);

    component.buy(component.included()[0]);

    expect(api.startAddOnCheckout).not.toHaveBeenCalled();
  });

  it('si el backend dice que el plan ya lo incluye, lo explica y recarga', () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { code: 'AddOn.AlreadyIncludedInPlan' } });
    const { component, api } = create([addOn('sms.addon', 'Available')], null, {
      startAddOnCheckout: vi.fn(() => throwError(() => conflict)),
    });

    component.buy(component.available()[0]);

    expect(component.buyError()).toBe('Your plan already includes it.');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  // Al volver del proveedor el add-on todavía no existe: lo crea el webhook, así que la intención se guarda
  // antes de irse y se sigue al volver.
  it('al comprar guarda la intención para poder seguirla al volver', () => {
    const { component } = create([addOn('sms.addon', 'Available')]);

    component.buy(component.available()[0]);

    expect(sessionStorage.getItem('tv-account-addon-intent')).toBe('i1');
  });

  it('al volver con la intención guardada avisa que lo está activando', () => {
    sessionStorage.setItem('tv-account-addon-intent', 'i1');

    const { component, page } = create([addOn('sms.addon', 'Available')], 'success');

    expect(component.outcome()).toBe('paid');
    expect(page.textContent).toContain("We're activating your add-on");
    expect(sessionStorage.getItem('tv-account-addon-intent')).toBeNull();
  });

  it('al volver sin intención guardada lo da por hecho', () => {
    const { component } = create([addOn('sms.addon', 'Active')], 'success');

    expect(component.outcome()).toBe('done');
  });

  it('sin complementos para el plan lo dice', () => {
    const { page } = create([]);

    expect(page.textContent).toContain('No add-ons available for your plan yet.');
  });

  it('nombra el complemento con el mismo diccionario que la pantalla de Plan', () => {
    // El catálogo guarda el nombre en la base y solo en español ("Correo"), así que el MISMO módulo
    // salía como "Correo" en Add-ons y como "Integrated email" en Plan. Ahora los dos leen
    // MODULE_LABELS, y el nombre de la base solo queda de respaldo.
    const { page } = create([addOn('addon-email', 'Available', { name: 'Correo', modules: ['email'] })]);

    expect(page.textContent).toContain('Integrated email');
    expect(page.textContent).not.toContain('Correo');
  });

  it('si el complemento no aporta módulos, cae al nombre del catálogo', () => {
    // Un add-on de solo cupos (sin `module.*`) no tiene etiqueta que buscar.
    const { page } = create([addOn('addon-seats', 'Available', { name: 'Extra seats', modules: [] })]);

    expect(page.textContent).toContain('Extra seats');
  });
});
