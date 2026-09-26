import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountSubscription } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountSeatsComponent } from './account-seats.component';

const me = {
  id: 'u1',
  name: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  actorType: 'TenantAdmin',
  tenant: { id: 't1', name: 'CoreTaxPro', subDomain: 'coretaxpro' },
  roles: [],
  permissions: ['seats.manage'],
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
    seats: { includedInPlan: 5, purchased: 2, total: 7 },
    addOns: [],
    openSeatCheckout: null,
    ...overrides,
  };
}

const quote = {
  seatType: 'Standard',
  quantity: 2,
  billingCycle: 'Monthly',
  unitAmountCents: 1500,
  proratedUnitAmountCents: 750,
  proratedTotalCents: 1500,
  currency: 'USD',
  currentPeriodEndUtc: '2026-10-01T00:00:00Z',
};

describe('AccountSeatsComponent', () => {
  function create(data: AccountSubscription, queryParam: string | null = null, overrides: object = {}) {
    const api = {
      get: vi.fn(() => of(data)),
      limits: vi.fn(() => of({ planCode: 'pro', maxUsers: 7, activeUsers: 4, pendingInvitations: 0, availableSeats: 3 })),
      seats: vi.fn(() => of({ items: [], totalCount: 0 })),
      seatQuote: vi.fn(() => of(quote)),
      startSeatCheckout: vi.fn(() => of({ seatPurchaseIntentId: 'i1', checkoutUrl: 'https://pay/x', paymentId: 'p1', expiresAtUtc: '2026-09-26T00:00:00Z' })),
      seatCheckoutStatus: vi.fn(() => of({ seatPurchaseIntentId: 'i1', status: 'Pending', seatType: 'Standard', quantity: 2, proratedTotalCents: 1500, currency: 'USD', checkoutUrl: null })),
      ...overrides,
    };
    TestBed.configureTestingModule({
      imports: [AccountSeatsComponent],
      providers: [
        { provide: AccountSubscriptionService, useValue: api },
        { provide: AccountSessionStore, useValue: { me: signal(me) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => queryParam } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(AccountSeatsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, api };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('muestra el uso de asientos y el desglose del plan', () => {
    const { component } = create(subscription());

    expect(component.usageLabel()).toBe('4 of 7 seats used');
    expect(component.breakdownLabel()).toContain('5 included in your plan · 2 purchased');
  });

  it('el precio lo calcula el backend, no la pantalla', () => {
    const { component, api } = create(subscription());
    component.quantity.set(2);

    component.getQuote();

    expect(api.seatQuote).toHaveBeenCalledWith('Standard', 2);
    expect(component.quoteTotalLabel()).toContain('15');
  });

  it('cambiar la cantidad invalida la cotización anterior', () => {
    const { fixture, component } = create(subscription());
    component.getQuote();
    expect(component.quote()).not.toBeNull();

    const input = fixture.nativeElement.querySelector('#seat-quantity') as HTMLInputElement;
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.quote()).toBeNull();
  });

  // Aceptación de la fase: el backend rechaza abrir un segundo cobro y la pantalla ofrece retomar el que hay.
  it('si ya hay una compra esperando pago, lo dice y ofrece terminarla', () => {
    const { component, page } = create(
      subscription({
        openSeatCheckout: {
          intentId: 'i1',
          seatType: 'Standard',
          quantity: 2,
          totalCents: 1500,
          currency: 'USD',
          checkoutUrl: 'https://pay/x',
          expiresAtUtc: '2026-09-26T00:00:00Z',
        },
      })
    );

    expect(page.textContent).toContain('A purchase is waiting for payment');
    expect(component.pendingLabel()).toContain('2 seat(s)');
    expect(page.querySelector<HTMLAnchorElement>('a[href="https://pay/x"]')).not.toBeNull();
  });

  it('un rechazo por compra en curso se explica y recarga el estado', () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { code: 'Seat.CheckoutInProgress' } });
    const { component, api } = create(subscription(), null, {
      startSeatCheckout: vi.fn(() => throwError(() => conflict)),
    });
    component.getQuote();

    component.buy();

    expect(component.buyError()).toBe('You already have a seat purchase waiting for payment.');
    expect(api.get).toHaveBeenCalledTimes(2); // recarga para mostrar la compra abierta
  });

  it('al volver del pago avisa que los asientos están en camino', () => {
    const { component } = create(
      subscription({
        openSeatCheckout: {
          intentId: 'i1',
          seatType: 'Standard',
          quantity: 2,
          totalCents: 1500,
          currency: 'USD',
          checkoutUrl: 'https://pay/x',
          expiresAtUtc: '2026-09-26T00:00:00Z',
        },
      }),
      'success'
    );

    expect(component.outcome()).toBe('paid');
  });

  // El webhook pudo llegar antes que el usuario: ya no hay intención abierta.
  it('al volver con el pago ya aplicado lo da por hecho', () => {
    const { component } = create(subscription(), 'success');

    expect(component.outcome()).toBe('done');
  });

  it('si el usuario cancela en el proveedor, lo dice sin alarmar', () => {
    const { component, page } = create(subscription(), 'cancelled');

    expect(component.outcome()).toBe('cancelled');
    expect(page.textContent).toContain('Nothing was charged');
  });
});
