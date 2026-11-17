import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SaaSPaymentRow, SubscriptionDiscount } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountBillingComponent } from './account-billing.component';

function row(overrides: Partial<SaaSPaymentRow> = {}): SaaSPaymentRow {
  return {
    id: crypto.randomUUID(),
    status: 'Succeeded',
    type: 'SubscriptionRenewal',
    amountCents: 4900,
    currency: 'USD',
    refundedAmountCents: 0,
    providerCode: 'Stripe',
    paidAtUtc: '2026-09-01T00:00:00Z',
    createdAtUtc: '2026-09-01T00:00:00Z',
    hasReceipt: false,
    canRetry: false,
    ...overrides,
  };
}

function discount(overrides: Partial<SubscriptionDiscount> = {}): SubscriptionDiscount {
  return {
    source: 'Code',
    percentBasisPoints: 2000,
    amountCents: null,
    currency: null,
    duration: 'Months',
    months: 3,
    appliesTo: 'Base',
    planCode: null,
    startsAtUtc: '2026-12-15T12:00:00Z',
    endsAtUtc: '2027-03-15T12:00:00Z',
    reason: null,
    ...overrides,
  };
}

function apiError(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: code } });
}

/** Lo vencido con un asiento: lo que "Pay what's due" ofrece pagar. */
function dueWith(seatId: string) {
  return {
    planRequired: false,
    includesPlan: false,
    items: [
      {
        kind: 'Seat',
        id: seatId,
        description: 'Standard seat',
        grossCents: 1500,
        amountCents: 1500,
        discountCents: 0,
        periodEndUtc: '2026-12-17T00:00:00Z',
      },
    ],
    totalCents: 1500,
    discountCents: 0,
    currency: 'USD',
    discountLabel: null,
  };
}

describe('AccountBillingComponent', () => {
  function create(overrides: object = {}) {
    const api = {
      payments: vi.fn(() => of({ items: [row()], totalCount: 1 })),
      receiptUrl: vi.fn(() =>
        of({ downloadUrl: 'https://files/receipt.pdf', expiresAtUtc: '2026-09-01T00:10:00Z' }),
      ),
      discount: vi.fn(() => of(null)),
      due: vi.fn(() =>
        of({ planRequired: false, items: [], totalCents: 0, discountCents: 0, currency: 'USD', discountLabel: null }),
      ),
      redeemDiscountCode: vi.fn(() => of(discount())),
      startRenewCheckout: vi.fn(() =>
        of({
          checkoutUrl: 'https://checkout.example/renew',
          intentId: 'intent-1',
          status: 'Pending',
        }),
      ),
      ...overrides,
    };
    const session = {
      me: () => ({ email: 'owner@example.com' }),
    } as unknown as AccountSessionStore;
    TestBed.configureTestingModule({
      imports: [AccountBillingComponent],
      providers: [
        provideRouter([]),
        { provide: AccountSubscriptionService, useValue: api },
        { provide: AccountSessionStore, useValue: session },
      ],
    });
    const fixture = TestBed.createComponent(AccountBillingComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      page: fixture.nativeElement as HTMLElement,
      api,
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('descuento', () => {
    it('sin descuento lo dice', () => {
      const { page } = create();

      expect(page.textContent).toContain('No active discount');
    });

    it('muestra el beneficio y hasta cuándo dura', () => {
      const { page } = create({ discount: vi.fn(() => of(discount())) });

      expect(page.textContent).toContain('20% off · until Mar 15, 2027');
    });

    it('un descuento para siempre o de un solo cobro se explica distinto', () => {
      const forever = create({
        discount: vi.fn(() => of(discount({ duration: 'Forever', months: null, endsAtUtc: null, percentBasisPoints: 1000 }))),
      });
      expect(forever.page.textContent).toContain('10% off · forever');
      TestBed.resetTestingModule();

      const once = create({
        discount: vi.fn(() => of(discount({ duration: 'Once', months: null, amountCents: 500, percentBasisPoints: null, currency: 'USD' }))),
      });
      expect(once.page.textContent).toContain('$5.00 off your next payment');
    });

    it('canjea un código y muestra el descuento nuevo', () => {
      const { component, fixture, page, api } = create();

      component.codeInput.set('  SPRING25 ');
      component.redeem();
      fixture.detectChanges();

      expect(api.redeemDiscountCode).toHaveBeenCalledWith('SPRING25');
      expect(page.textContent).toContain('20% off · until Mar 15, 2027');
      expect(component.codeInput()).toBe('');
    });

    it.each([
      [404, 'Codes.CreateQuote.CodeNotFound', "This code isn't valid for your account"],
      [400, 'Codes.CodeDefinition.NotUsableHere', "This code isn't valid for your account"],
      [410, 'Codes.CodeDefinition.Expired', 'This code has expired'],
      [409, 'Codes.CodeUsageCounter.TenantLimitReached', 'This code was already used'],
      [409, 'Subscription.Discount.AlreadyActive', 'You already have an active discount'],
    ])('un %s %s se explica', (status, code, message) => {
      const { component, fixture, page } = create({
        redeemDiscountCode: vi.fn(() => throwError(() => apiError(status, code))),
      });

      component.codeInput.set('NOPE');
      component.redeem();
      fixture.detectChanges();

      expect(page.textContent).toContain(message);
      expect(component.redeeming()).toBe(false);
    });
  });

  it('muestra cada cobro con su concepto en palabras del usuario', () => {
    const { page } = create();

    expect(page.textContent).toContain('Subscription renewal');
    expect(page.textContent).toContain('$49.00');
    expect(page.textContent).toContain('Paid');
  });

  // Aceptación de la fase: el pago del onboarding aparece en el historial del tenant.
  it('el primer pago del onboarding aparece como una línea más', () => {
    const { component, page } = create({
      payments: vi.fn(() => of({ items: [row({ type: 'OnboardingInitial' })], totalCount: 1 })),
    });

    expect(component.descriptionOf(component.rows()[0])).toBe('First payment');
    expect(page.textContent).toContain('First payment');
  });

  it('un reembolso parcial se ve junto al importe', () => {
    const { component } = create({
      payments: vi.fn(() =>
        of({
          items: [row({ status: 'PartiallyRefunded', refundedAmountCents: 1000 })],
          totalCount: 1,
        }),
      ),
    });

    expect(component.refundLabel(component.rows()[0])).toBe('$10.00 refunded');
    expect(component.statusOf(component.rows()[0])).toBe('Partially refunded');
  });

  // Un tipo de pago que el backend gane después no debe romper la pantalla.
  it('un tipo desconocido se muestra tal cual en vez de romper', () => {
    const { component } = create({
      payments: vi.fn(() => of({ items: [row({ type: 'SomethingNew' })], totalCount: 1 })),
    });

    expect(component.descriptionOf(component.rows()[0])).toBe('SomethingNew');
  });

  it('pagina el historial: cada página reemplaza a la anterior y se puede volver', () => {
    const payments = vi
      .fn()
      .mockReturnValueOnce(of({ items: [row()], totalCount: 23 }))
      .mockReturnValueOnce(of({ items: [row({ type: 'SeatsPurchaseCharge' })], totalCount: 23 }))
      .mockReturnValueOnce(of({ items: [row()], totalCount: 23 }));
    const { component, api } = create({ payments });

    expect(component.page()).toBe(1);
    expect(component.totalPages()).toBe(3);
    expect(component.hasPrevious()).toBe(false);
    expect(component.rangeLabel()).toBe('Showing 1–10 of 23');

    component.goToPage(2);

    expect(api.payments).toHaveBeenLastCalledWith(2, 10);
    expect(component.rows().map(r => r.type)).toEqual(['SeatsPurchaseCharge']);
    expect(component.page()).toBe(2);
    expect(component.pageLabel()).toBe('Page 2 of 3');

    component.goToPage(1);

    expect(api.payments).toHaveBeenLastCalledWith(1, 10);
    expect(component.page()).toBe(1);
  });

  it('con una sola página no muestra la paginación ni pide páginas fuera de rango', () => {
    const { component, api } = create();

    expect(component.totalPages()).toBe(1);
    component.goToPage(2);
    component.goToPage(0);

    expect(api.payments).toHaveBeenCalledTimes(1);
  });

  it('un pago con descuento muestra el código enmascarado y lo descontado', () => {
    const { component } = create();

    expect(
      component.paymentDiscountOf(row({ discountAmountCents: 300, discountLabel: 'Promo code SPRI...0420 · 20% off' })),
    ).toBe('Promo code SPRI...0420 · 20% off (−$3.00)');
    expect(component.paymentDiscountOf(row({ discountAmountCents: 300 }))).toBe('Discount (−$3.00)');
    expect(component.paymentDiscountOf(row())).toBe('');
  });

  // Aceptación de la fase: el recibo se descarga desde el historial, y solo el del propio tenant.
  it('un pago con recibo ofrece descargarlo y abre la URL firmada', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { component, api, page } = create({
      payments: vi.fn(() => of({ items: [row({ hasReceipt: true })], totalCount: 1 })),
    });

    expect(page.textContent).toContain('Download');
    component.openReceipt(component.rows()[0]);

    expect(api.receiptUrl).toHaveBeenCalledWith(component.rows()[0].id);
    expect(open).toHaveBeenCalledWith('https://files/receipt.pdf', '_blank', 'noopener');
    vi.unstubAllGlobals();
  });

  // El PDF se genera después del cobro: hasta que exista no hay nada que ofrecer.
  it('un pago sin recibo todavía no ofrece descarga', () => {
    const { component, api } = create();

    component.openReceipt(component.rows()[0]);

    expect(api.receiptUrl).not.toHaveBeenCalled();
  });

  it('si el recibo aún se está generando lo explica', () => {
    const notReady = new HttpErrorResponse({ status: 409, error: { code: 'Receipt.NotReady' } });
    const { component } = create({
      payments: vi.fn(() => of({ items: [row({ hasReceipt: true })], totalCount: 1 })),
      receiptUrl: vi.fn(() => throwError(() => notReady)),
    });

    component.openReceipt(component.rows()[0]);

    expect(component.receiptError()).toBe(
      'The receipt is still being generated. Try again in a moment.',
    );
  });

  it('sin pagos lo dice', () => {
    const { page } = create({ payments: vi.fn(() => of({ items: [], totalCount: 0 })) });

    expect(page.textContent).toContain('No payments yet.');
  });

  it('si la lectura falla ofrece reintentar', () => {
    const { component } = create({ payments: vi.fn(() => throwError(() => new Error('boom'))) });

    expect(component.failed()).toBe(true);
  });

  // --- Pay now por fila fallida ---

  it('una renovación fallida de la suscripción ofrece Pay now y abre el picker', () => {
    const { component } = create({
      payments: vi.fn(() =>
        of({
          items: [row({ status: 'Failed', type: 'SubscriptionRenewal', canRetry: true })],
          totalCount: 1,
        }),
      ),
    });

    const r = component.rows()[0];
    expect(component.canPayNow(r)).toBe(true);
    expect(component.payNowKind(r)).toBe('subscription-renewal');
    expect(component.pickerOpen()).toBe(false);

    component.startPayNow(r);

    expect(component.pickerOpen()).toBe(true);
  });

  it('elegir provider lanza el renew checkout con ese provider', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, origin: 'https://app.local', assign });
    const { component, api } = create({
      payments: vi.fn(() =>
        of({ items: [row({ status: 'Failed', type: 'SubscriptionRenewal' })], totalCount: 1 }),
      ),
    });
    component.startPayNow(component.rows()[0]);

    component.onProviderPicked({
      provider: 'PayPal',
      method: 'PayPal',
      displayName: 'PayPal',
      enabled: true,
      priority: 2,
      disabledReason: null,
    });

    expect(api.startRenewCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'PayPal',
        method: 'PayPal',
      }),
    );
    expect(api.startRenewCheckout).not.toHaveBeenCalledWith(expect.objectContaining({ payerEmail: expect.anything() }));
    expect(assign).toHaveBeenCalledWith('https://checkout.example/renew');
    vi.unstubAllGlobals();
  });

  it('una renovación de seat fallida lleva a Pagar lo vencido en esta página', () => {
    const { component } = create({
      payments: vi.fn(() =>
        of({
          items: [row({ status: 'Failed', type: 'SeatRenewal', canRetry: true, targetId: 'seat-1' })],
          totalCount: 1,
        }),
      ),
      due: vi.fn(() => of(dueWith('seat-1'))),
    });

    const r = component.rows()[0];
    expect(component.canPayNow(r)).toBe(true);
    expect(component.payNowKind(r)).toBe('seat');
    expect(component.payNowRouterLink(r)).toBeNull();
    expect(component.payNowLabel(r)).toBe('Pay now');
  });

  it('una renovación de add-on fallida también se paga en Pagar lo vencido', () => {
    const { component } = create({
      payments: vi.fn(() =>
        of({ items: [row({ status: 'Failed', type: 'AddOnRenewal' })], totalCount: 1 }),
      ),
    });

    const r = component.rows()[0];
    expect(component.payNowKind(r)).toBe('addon');
    expect(component.payNowRouterLink(r)).toBeNull();
  });

  // Un asiento ya pagado en otro cobro (o quitado) no está vencido: "Pay now" sería mentira y abre la puerta a un doble cobro.
  it('una renovación de seat fallida cuyo asiento ya no está vencido no ofrece Pay now', () => {
    const { component, page } = create({
      payments: vi.fn(() =>
        of({
          items: [row({ status: 'Failed', type: 'SeatRenewal', canRetry: true, targetId: 'seat-paid' })],
          totalCount: 1,
        }),
      ),
      due: vi.fn(() => of(dueWith('seat-other'))),
    });

    expect(component.canPayNow(component.rows()[0])).toBe(false);
    expect(page.textContent).not.toContain('Pay now');
  });

  it('una renovación de add-on fallida sin nada vencido no ofrece Pay now', () => {
    const { component } = create({
      payments: vi.fn(() =>
        of({
          items: [row({ status: 'Failed', type: 'AddOnRenewal', canRetry: true, targetId: 'addon-1' })],
          totalCount: 1,
        }),
      ),
    });

    expect(component.canPayNow(component.rows()[0])).toBe(false);
  });

  it('un pago Succeeded no ofrece Pay now', () => {
    const { component } = create({
      payments: vi.fn(() =>
        of({ items: [row({ status: 'Succeeded', type: 'SubscriptionRenewal' })], totalCount: 1 }),
      ),
    });

    expect(component.canPayNow(component.rows()[0])).toBe(false);
  });
});
