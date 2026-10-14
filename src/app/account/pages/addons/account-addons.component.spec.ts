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

function subscription(addOns: AccountAddOn[], openAddOnCheckouts: AccountSubscription['openAddOnCheckouts'] = null): AccountSubscription {
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
    openAddOnCheckouts,
  };
}

function openCheckout(intentId: string, overrides: Partial<AccountSubscription['openAddOnCheckouts'] extends (infer U)[] | null ? U : never> = {}) {
  return {
    intentId,
    addOnCode: 'sms.addon',
    addOnDisplayName: 'SMS',
    quantity: 1,
    totalCents: 2900,
    currency: 'USD',
    checkoutUrl: 'https://pay/x',
    expiresAtUtc: '2026-10-15T00:00:00Z',
    ...overrides,
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

  describe('cancelar un addon pending', () => {
    // Al volver con ?checkout=cancelled y una intención guardada, la pantalla ofrece cerrarla.
    function createWithPendingIntent(overrides: object = {}) {
      sessionStorage.setItem('tv-account-addon-intent', 'i1');
      return create([addOn('sms.addon', 'Available')], 'cancelled', overrides);
    }

    it('ofrece la tarjeta de cancelar cuando hay un intent pending', () => {
      const { component, page } = createWithPendingIntent();

      expect(component.pendingIntentId()).toBe('i1');
      expect(page.textContent).toContain('Cancel pending purchase');
    });

    it('si el usuario rechaza el confirm, no se llama al endpoint', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const cancelPendingAddOnCheckout = vi.fn(() => of({ alreadyCancelled: false, intentId: 'i1' }));
      const { component } = createWithPendingIntent({ cancelPendingAddOnCheckout });

      component.cancelPending('i1');

      expect(cancelPendingAddOnCheckout).not.toHaveBeenCalled();
      expect(component.cancelNotice()).toBeNull();
      confirmSpy.mockRestore();
    });

    it('cancelar llama al endpoint, muestra el toast y recarga', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const cancelPendingAddOnCheckout = vi.fn(() => of({ alreadyCancelled: false, intentId: 'i1' }));
      const { component, api } = createWithPendingIntent({ cancelPendingAddOnCheckout });

      component.cancelPending('i1');

      expect(cancelPendingAddOnCheckout).toHaveBeenCalledWith('i1');
      expect(component.cancelNotice()).toEqual({ kind: 'ok' });
      expect(api.get).toHaveBeenCalledTimes(2); // recarga tras el cierre del intent
      confirmSpy.mockRestore();
    });

    it('si el intent ya estaba cerrado, mensaje idempotente', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { component } = createWithPendingIntent({
        cancelPendingAddOnCheckout: vi.fn(() => of({ alreadyCancelled: true, intentId: 'i1' })),
      });

      component.cancelPending('i1');

      expect(component.cancelNotice()).toEqual({ kind: 'already' });
      confirmSpy.mockRestore();
    });

    it('fallo del service → toast de error y vuelve a habilitar el botón', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { component } = createWithPendingIntent({
        cancelPendingAddOnCheckout: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))),
      });

      component.cancelPending('i1');

      expect(component.cancelNotice()).toEqual({ kind: 'error' });
      expect(component.cancellingId()).toBeNull();
      confirmSpy.mockRestore();
    });

    it('al cancelar limpia el intent del storage y del estado', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { component } = createWithPendingIntent({
        cancelPendingAddOnCheckout: vi.fn(() => of({ alreadyCancelled: false, intentId: 'i1' })),
      });

      component.cancelPending('i1');

      expect(component.pendingIntentId()).toBeNull();
      expect(sessionStorage.getItem('tv-account-addon-intent')).toBeNull();
      confirmSpy.mockRestore();
    });
  });

  describe('snapshot con openAddOnCheckouts', () => {
    // Cuando el backend informa intents abiertos, la pantalla los lista aunque el navegador haya perdido el storage.
    function createWithSnapshot(openAddOnCheckouts: AccountSubscription['openAddOnCheckouts'], overrides: object = {}) {
      const api = {
        get: vi.fn(() => of(subscription([addOn('sms.addon', 'Available')], openAddOnCheckouts))),
        addOnCheckoutStatus: vi.fn(() => of({ addOnPurchaseIntentId: 'i1', status: 'Pending', addOnCode: 'sms.addon', quantity: 1, proratedTotalCents: 2900, currency: 'USD', checkoutUrl: null })),
        startAddOnCheckout: vi.fn(() => of({ addOnPurchaseIntentId: 'i1', checkoutUrl: 'https://pay/x', paymentId: 'p1', expiresAtUtc: '2026-09-26T00:00:00Z' })),
        ...overrides,
      };
      TestBed.configureTestingModule({
        imports: [AccountAddOnsComponent],
        providers: [
          { provide: AccountSubscriptionService, useValue: api },
          { provide: AccountSessionStore, useValue: { me: signal(me) } },
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        ],
      });
      const fixture = TestBed.createComponent(AccountAddOnsComponent);
      fixture.detectChanges();
      return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, api };
    }

    it('con una intención abierta pinta su tarjeta con el nombre y el botón Resume', () => {
      const { component, page } = createWithSnapshot([openCheckout('i-snapshot', { addOnDisplayName: 'SMS' })]);

      expect(component.openCheckouts()).toHaveLength(1);
      expect(page.textContent).toContain('SMS');
      expect(page.textContent).toContain('Resume payment');
    });

    it('sin snapshot pero con intent en storage cae al fallback (sin Resume por falta de URL)', () => {
      sessionStorage.setItem('tv-account-addon-intent', 'i-legacy');
      const api = {
        get: vi.fn(() => of(subscription([addOn('sms.addon', 'Available')], null))),
        addOnCheckoutStatus: vi.fn(),
        startAddOnCheckout: vi.fn(),
      };
      TestBed.configureTestingModule({
        imports: [AccountAddOnsComponent],
        providers: [
          { provide: AccountSubscriptionService, useValue: api },
          { provide: AccountSessionStore, useValue: { me: signal(me) } },
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'cancelled' } } } },
        ],
      });
      const fixture = TestBed.createComponent(AccountAddOnsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const page = fixture.nativeElement as HTMLElement;

      expect(component.openCheckouts()[0].intentId).toBe('i-legacy');
      expect(page.textContent).not.toContain('Resume payment');
      expect(page.textContent).toContain('Cancel pending purchase');
    });

    it('con dos intentos abiertos pinta las dos tarjetas', () => {
      const { component, page } = createWithSnapshot([
        openCheckout('i-sms', { addOnCode: 'sms.addon', addOnDisplayName: 'SMS' }),
        openCheckout('i-email', { addOnCode: 'email.addon', addOnDisplayName: 'Email' }),
      ]);

      expect(component.openCheckouts()).toHaveLength(2);
      const titles = Array.from(page.querySelectorAll('h2')).map(h => h.textContent ?? '');
      expect(titles.some(t => t.includes('SMS'))).toBe(true);
      expect(titles.some(t => t.includes('Email'))).toBe(true);
    });

    it('cancelar sobre un intent del snapshot llama al service y recarga', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const cancelPendingAddOnCheckout = vi.fn(() => of({ alreadyCancelled: false, intentId: 'i-snapshot' }));
      const { component, api } = createWithSnapshot([openCheckout('i-snapshot')], { cancelPendingAddOnCheckout });

      component.cancelPending('i-snapshot');

      expect(cancelPendingAddOnCheckout).toHaveBeenCalledWith('i-snapshot');
      expect(api.get).toHaveBeenCalledTimes(2);
      confirmSpy.mockRestore();
    });
  });
});
