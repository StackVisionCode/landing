import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { DuePayment, DuePaymentItem } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { DuePaymentComponent } from './due-payment.component';

function item(overrides: Partial<DuePaymentItem> = {}): DuePaymentItem {
  return {
    kind: 'Seat',
    id: 'seat-1',
    description: 'Standard seat',
    grossCents: 1500,
    amountCents: 1500,
    discountCents: 0,
    periodEndUtc: '2026-12-16T00:00:00Z',
    ...overrides,
  };
}

function due(items: DuePaymentItem[], planRequired = false): DuePayment {
  return {
    planRequired,
    items,
    totalCents: items.reduce((sum, i) => sum + i.amountCents, 0),
    discountCents: 0,
    currency: 'USD',
    discountLabel: null,
  };
}

describe('DuePaymentComponent', () => {
  function create(overrides: object = {}) {
    const api = {
      due: vi.fn(() =>
        of(
          due(
            [
              item({ kind: 'Plan', id: 'plan', description: 'Pro plan', amountCents: 2900 }),
              item({ id: 'seat-1' }),
              item({ id: 'seat-2' }),
              item({ kind: 'AddOn', id: 'addon-1', description: 'Extra storage', amountCents: 500 }),
            ],
            true,
          ),
        ),
      ),
      startRenewCheckout: vi.fn(() =>
        of({ renewalIntentId: 'i', checkoutUrl: 'https://pay/x', paymentId: 'p', expiresAtUtc: '' }),
      ),
      removeUnusedSeats: vi.fn(() => of({ removed: 1 })),
      ...overrides,
    };
    const session = { me: () => ({ email: 'owner@example.com' }) } as unknown as AccountSessionStore;
    TestBed.configureTestingModule({
      imports: [DuePaymentComponent],
      providers: [
        { provide: AccountSubscriptionService, useValue: api },
        { provide: AccountSessionStore, useValue: session },
      ],
    });
    const fixture = TestBed.createComponent(DuePaymentComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, api };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('lista todo lo vencido marcado y suma el total', () => {
    const { component, page } = create();

    expect(component.items().length).toBe(4);
    expect(component.totalCents()).toBe(2900 + 1500 + 1500 + 500);
    expect(page.textContent).toContain('Pro plan');
  });

  it('desmarcar un asiento baja el total en vivo', () => {
    const { component } = create();

    component.toggle(component.items()[1]);

    expect(component.totalCents()).toBe(2900 + 1500 + 500);
  });

  it('el plan vencido no se puede desmarcar', () => {
    const { component } = create();
    const plan = component.items()[0];

    component.toggle(plan);

    expect(component.isChecked(plan)).toBe(true);
  });

  it('pagar manda solo lo marcado en un checkout', () => {
    const { component, api } = create();
    component.toggle(component.items()[2]);

    component.onProviderPicked({ provider: 'Stripe', method: 'Card' } as never);

    expect(api.startRenewCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ seatIds: ['seat-1'], addOnIds: ['addon-1'], provider: 'Stripe' }),
    );
  });

  it('con un pago abierto explica que hay que terminarlo o cancelarlo', () => {
    const error = new HttpErrorResponse({ status: 409, error: { code: 'Subscription.Due.CheckoutOpen' } });
    const { component } = create({ startRenewCheckout: vi.fn(() => throwError(() => error)) });

    component.onProviderPicked({ provider: 'Stripe', method: 'Card' } as never);

    expect(component.error()).toContain('already open');
  });

  it('quitar asientos pide confirmación y quita solo los desmarcados', () => {
    const { component, api } = create();
    component.toggle(component.items()[2]);

    component.removeUnchecked();
    expect(api.removeUnusedSeats).not.toHaveBeenCalled();
    component.removeUnchecked();

    expect(api.removeUnusedSeats).toHaveBeenCalledWith(['seat-2']);
  });

  it('sin nada vencido no muestra nada', () => {
    const { page } = create({ due: vi.fn(() => of(due([]))) });

    expect(page.textContent?.trim()).toBe('');
  });
});
