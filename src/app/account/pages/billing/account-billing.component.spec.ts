import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SaaSPaymentRow } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
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
    ...overrides,
  };
}

describe('AccountBillingComponent', () => {
  function create(overrides: object = {}) {
    const api = {
      payments: vi.fn(() => of({ items: [row()], totalCount: 1 })),
      receiptUrl: vi.fn(() => of({ downloadUrl: 'https://files/receipt.pdf', expiresAtUtc: '2026-09-01T00:10:00Z' })),
      ...overrides,
    };
    TestBed.configureTestingModule({
      imports: [AccountBillingComponent],
      providers: [{ provide: AccountSubscriptionService, useValue: api }],
    });
    const fixture = TestBed.createComponent(AccountBillingComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, api };
  }

  afterEach(() => TestBed.resetTestingModule());

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
      payments: vi.fn(() => of({ items: [row({ status: 'PartiallyRefunded', refundedAmountCents: 1000 })], totalCount: 1 })),
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

  it('ver más suma la página siguiente sin reemplazar lo que ya está', () => {
    const payments = vi
      .fn()
      .mockReturnValueOnce(of({ items: [row()], totalCount: 2 }))
      .mockReturnValueOnce(of({ items: [row({ type: 'SeatsPurchaseCharge' })], totalCount: 2 }));
    const { component } = create({ payments });

    expect(component.hasMore()).toBe(true);
    component.loadMore();

    expect(component.rows().length).toBe(2);
    expect(component.hasMore()).toBe(false);
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

    expect(component.receiptError()).toBe('The receipt is still being generated. Try again in a moment.');
  });

  it('sin pagos lo dice', () => {
    const { page } = create({ payments: vi.fn(() => of({ items: [], totalCount: 0 })) });

    expect(page.textContent).toContain('No payments yet.');
  });

  it('si la lectura falla ofrece reintentar', () => {
    const { component } = create({ payments: vi.fn(() => throwError(() => new Error('boom'))) });

    expect(component.failed()).toBe(true);
  });
});
