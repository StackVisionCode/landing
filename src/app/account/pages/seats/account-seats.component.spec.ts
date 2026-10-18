import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AccountSubscription } from '@core/account/account-subscription.models';
import { AccountSubscriptionService } from '@core/account/account-subscription.service';
import {
  AccountSeatSlotReport,
  AccountSeatSlotService,
} from '@core/account/account-seat-slot.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { DEFAULT_PAYMENT_OPTION } from '@core/account/account-payment-options.service';
import { AccountSeatsComponent } from './account-seats.component';

/** Minimal shape; the component only reads `isAccountAdmin()` and `me()`. */
function sessionStub(admin = true) {
  return { me: signal(me), isAccountAdmin: signal(admin) };
}

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
      cancelAtPeriodEnd: false,
      cancelledAtUtc: null,
    },
    pendingPlanChange: null,
    seats: { includedInPlan: 5, purchased: 2, total: 7 },
    addOns: [],
    openSeatCheckout: null,
    openAddOnCheckouts: null,
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

const slotReport: AccountSeatSlotReport = {
  effectiveCap: 2,
  mode: 'Shadow',
  slots: [
    {
      userId: 'owner',
      fullName: 'Ada Owner',
      email: 'owner@example.com',
      isOwner: true,
      slotIndex: 1,
      slotPriorityAt: '0001-01-01T00:00:00.000Z',
      isGated: false,
    },
    {
      userId: 'u2',
      fullName: 'Grace Hopper',
      email: 'grace@example.com',
      isOwner: false,
      slotIndex: 2,
      slotPriorityAt: '2026-01-02T00:00:00.000Z',
      isGated: false,
    },
    {
      userId: 'u3',
      fullName: 'Katherine Johnson',
      email: 'katherine@example.com',
      isOwner: false,
      slotIndex: 3,
      slotPriorityAt: '2026-01-03T00:00:00.000Z',
      isGated: true,
    },
  ],
};

describe('AccountSeatsComponent', () => {
  function create(
    data: AccountSubscription,
    queryParam: string | null = null,
    overrides: object = {},
    slotOverrides: object = {},
    isAdmin = true,
  ) {
    const api = {
      get: vi.fn(() => of(data)),
      limits: vi.fn(() =>
        of({
          planCode: 'pro',
          maxUsers: 7,
          activeUsers: 4,
          pendingInvitations: 0,
          availableSeats: 3,
        }),
      ),
      seats: vi.fn(() => of({ items: [], totalCount: 0 })),
      seatQuote: vi.fn(() => of(quote)),
      startSeatCheckout: vi.fn(() =>
        of({
          seatPurchaseIntentId: 'i1',
          checkoutUrl: 'https://pay/x',
          paymentId: 'p1',
          expiresAtUtc: '2026-09-26T00:00:00Z',
        }),
      ),
      seatCheckoutStatus: vi.fn(() =>
        of({
          seatPurchaseIntentId: 'i1',
          status: 'Pending',
          seatType: 'Standard',
          quantity: 2,
          proratedTotalCents: 1500,
          currency: 'USD',
          checkoutUrl: null,
        }),
      ),
      cancelPendingSeatCheckout: vi.fn(() => of({ alreadyCancelled: false, intentId: 'i1' })),
      ...overrides,
    };
    const slotApi = {
      getSlots: vi.fn(() => of(slotReport)),
      overrideSlotPriority: vi.fn(() => of(undefined)),
      overridePriority: vi.fn(() => of(undefined)),
      ...slotOverrides,
    };
    TestBed.configureTestingModule({
      imports: [AccountSeatsComponent],
      providers: [
        { provide: AccountSubscriptionService, useValue: api },
        { provide: AccountSeatSlotService, useValue: slotApi },
        { provide: AccountSessionStore, useValue: sessionStub(isAdmin) },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => queryParam } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(AccountSeatsComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      page: fixture.nativeElement as HTMLElement,
      api,
      slotApi,
    };
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
      }),
    );

    expect(page.textContent).toContain('A purchase is waiting for payment');
    expect(component.pendingLabel()).toContain('2 seat(s)');
    expect(page.querySelector<HTMLAnchorElement>('a[href="https://pay/x"]')).not.toBeNull();
  });

  it('un rechazo por compra en curso se explica y recarga el estado', () => {
    const conflict = new HttpErrorResponse({
      status: 409,
      error: { code: 'Seat.CheckoutInProgress' },
    });
    const { component, api } = create(subscription(), null, {
      startSeatCheckout: vi.fn(() => throwError(() => conflict)),
    });
    component.getQuote();

    component.buy();
    component.onProviderPicked(DEFAULT_PAYMENT_OPTION);

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
      'success',
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

  describe('cancelar un intent pending', () => {
    const withOpen = subscription({
      openSeatCheckout: {
        intentId: 'i1',
        seatType: 'Standard',
        quantity: 2,
        totalCents: 1500,
        currency: 'USD',
        checkoutUrl: 'https://pay/x',
        expiresAtUtc: '2026-09-26T00:00:00Z',
      },
    });

    it('la tarjeta pending ofrece Resume y Cancel', () => {
      const { page } = create(withOpen);

      expect(page.textContent).toContain('Finish payment');
      expect(page.textContent).toContain('Cancel & start over');
    });

    it('cancelar llama al endpoint, muestra el toast y recarga', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { component, api } = create(withOpen);

      component.cancelPending();

      expect(api.cancelPendingSeatCheckout).toHaveBeenCalledWith('i1');
      expect(component.cancelNotice()).toEqual({ kind: 'ok' });
      expect(api.get).toHaveBeenCalledTimes(2);
      confirmSpy.mockRestore();
    });

    it('si el intent ya estaba cerrado, mensaje idempotente', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { component } = create(withOpen, null, {
        cancelPendingSeatCheckout: vi.fn(() => of({ alreadyCancelled: true, intentId: 'i1' })),
      });

      component.cancelPending();

      expect(component.cancelNotice()).toEqual({ kind: 'already' });
      confirmSpy.mockRestore();
    });

    it('fallo del service → toast de error y vuelve a habilitar el botón', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { component } = create(withOpen, null, {
        cancelPendingSeatCheckout: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status: 500 })),
        ),
      });

      component.cancelPending();

      expect(component.cancelNotice()).toEqual({ kind: 'error' });
      expect(component.cancelling()).toBe(false);
      confirmSpy.mockRestore();
    });

    it('si el usuario cierra el confirm, no se llama al endpoint', () => {
      const { component, api } = create(withOpen);

      component.openCancelConfirm();
      component.dismissCancelConfirm();

      expect(api.cancelPendingSeatCheckout).not.toHaveBeenCalled();
      expect(component.cancelNotice()).toBeNull();
    });
  });

  // B4.a — Portal/Signature no se cuentan por política (feedback senior); solo Standard.
  describe('breakdown por estado de seats Standard', () => {
    const makeSeat = (type: string, status: string) => ({
      id: `${type}-${status}`,
      type,
      status,
      nextRenewalAtUtc: null,
      autoRenew: true,
    });

    it('cuenta Active, PastDue y Suspended por separado para Standard', () => {
      const { component } = create(subscription(), null, {
        seats: vi.fn(() =>
          of({
            items: [
              makeSeat('Standard', 'Active'),
              makeSeat('Standard', 'Active'),
              makeSeat('Standard', 'PastDue'),
              makeSeat('Standard', 'Suspended'),
            ],
            totalCount: 4,
          }),
        ),
      });

      expect(component.standardStatusBreakdown()).toEqual({ active: 2, pastDue: 1, suspended: 1 });
      expect(component.hasStandardAttention()).toBe(true);
    });

    it('ignora Portal y otros tipos no-Standard', () => {
      const { component } = create(subscription(), null, {
        seats: vi.fn(() =>
          of({
            items: [
              makeSeat('Standard', 'Active'),
              makeSeat('Portal', 'Active'),
              makeSeat('Portal', 'Suspended'),
              makeSeat('Signature', 'PastDue'),
            ],
            totalCount: 4,
          }),
        ),
      });

      expect(component.standardStatusBreakdown()).toEqual({ active: 1, pastDue: 0, suspended: 0 });
      expect(component.hasStandardAttention()).toBe(false);
    });
  });

  describe('orden determinista de acceso', () => {
    it('muestra el slot y estado de cada miembro activo', () => {
      const { page } = create(subscription());

      expect(page.textContent).toContain('Team access order');
      expect(page.textContent).toContain('Ada Owner');
      expect(page.textContent).toContain('Katherine Johnson');
      expect(page.textContent).toContain('Gated');
      expect(page.querySelectorAll('tbody tr')).toHaveLength(3);
    });

    it('explica en Shadow qui\u00e9n quedar\u00eda bloqueado', () => {
      const { page } = create(subscription());

      expect(page.textContent).toContain('Will be blocked after rollout');
      expect(page.textContent).toContain('katherine@example.com');
      expect(page.textContent).toContain('seat capacity');
    });

    it('reordena con motivo auditado y refresca el reporte', () => {
      const { component, fixture, slotApi } = create(subscription());
      component.openReorder(slotReport.slots[2]);
      component.reorderTarget.set(2);
      component.reorderReason.set('Keep the support lead active');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();

      component.saveReorder();

      expect(slotApi.overrideSlotPriority).toHaveBeenCalledWith('u3', {
        slotPriorityAt: '0001-01-01T00:00:00.001Z',
        reason: 'Keep the support lead active',
      });
      expect(slotApi.getSlots).toHaveBeenCalledTimes(2);
      expect(component.reorderSuccess()).toBe('The team access order was updated.');
    });

    // G-L1 — un visor no-admin nunca debe ver el disparador de reordenamiento ni poder abrir el modal.
    it('oculta Reorder y no permite abrir el modal si el visor no es TenantAdmin', () => {
      const { component, page } = create(subscription(), null, {}, {}, /* isAdmin */ false);

      // Fila de Katherine (slot 3, no owner): sin admin no hay botón.
      const buttons = page.querySelectorAll('button[aria-label^="Reorder slot:"]');
      expect(buttons.length).toBe(0);

      component.openReorder(slotReport.slots[2]);
      expect(component.reorderOpen()).toBe(false);
    });

    // La acción está desactivada contra el owner incluso si se intenta por API: openReorder sale early.
    it('no abre el modal para el owner', () => {
      const { component } = create(subscription());
      component.openReorder(slotReport.slots[0]);
      expect(component.reorderOpen()).toBe(false);
    });

    // "Send to end" manda slotPriorityAt=null; el reason sigue siendo obligatorio.
    it('Send to end envía slotPriorityAt null con motivo', () => {
      const { component, slotApi } = create(subscription());
      component.openReorder(slotReport.slots[2]);
      component.reorderReason.set('Move to tail');
      component.sendToEnd();

      expect(slotApi.overrideSlotPriority).toHaveBeenCalledWith('u3', {
        slotPriorityAt: null,
        reason: 'Move to tail',
      });
    });

    it('Send to end rechaza motivo vacío con mensaje inline', () => {
      const { component, slotApi } = create(subscription());
      component.openReorder(slotReport.slots[2]);
      component.reorderReason.set('ab');
      component.sendToEnd();

      expect(slotApi.overrideSlotPriority).not.toHaveBeenCalled();
      expect(component.reorderError()).toBe('Please provide a reason with at least 3 characters.');
    });

    it('mapea 400 invalid_reason a mensaje inline del textarea', () => {
      const bad = new HttpErrorResponse({
        status: 400,
        error: { code: 'seats.slot_priority.invalid_reason' },
      });
      const { component } = create(
        subscription(),
        null,
        {},
        { overrideSlotPriority: vi.fn(() => throwError(() => bad)) },
      );
      component.openReorder(slotReport.slots[2]);
      component.reorderReason.set('Reorder for coverage');
      component.saveReorder();

      expect(component.reorderError()).toBe('Please provide a reason with at least 3 characters.');
      expect(component.reorderToast()).toBeNull();
    });

    it('mapea 429 a toast de rate limit sin cerrar el modal', () => {
      const limited = new HttpErrorResponse({ status: 429, error: { code: 'RateLimit.Exceeded' } });
      const { component } = create(
        subscription(),
        null,
        {},
        { overrideSlotPriority: vi.fn(() => throwError(() => limited)) },
      );
      component.openReorder(slotReport.slots[2]);
      component.reorderReason.set('Reorder for coverage');
      component.saveReorder();

      expect(component.reorderToast()).toBe('Too many changes. Wait a minute and try again.');
      expect(component.reorderOpen()).toBe(true);
      expect(component.reorderSaving()).toBe(false);
    });

    it('mapea 403 a toast de permiso faltante', () => {
      const forbidden = new HttpErrorResponse({
        status: 403,
        error: { code: 'seats.slot_gating.manage' },
      });
      const { component } = create(
        subscription(),
        null,
        {},
        { overrideSlotPriority: vi.fn(() => throwError(() => forbidden)) },
      );
      component.openReorder(slotReport.slots[2]);
      component.reorderReason.set('Reorder for coverage');
      component.saveReorder();

      expect(component.reorderToast()).toBe("You don't have permission to reorder slots.");
    });

    // G-L4 — mientras hay un submit en curso, un segundo submit no se dispara.
    it('ignora un segundo submit mientras hay uno en curso (sin doble PATCH)', () => {
      // El Subject hace que el primer submit siga abierto cuando llega el segundo.
      const gate = new Subject<void>();
      const spy = vi.fn(() => gate.asObservable());
      const { component } = create(subscription(), null, {}, { overrideSlotPriority: spy });
      component.openReorder(slotReport.slots[2]);
      component.reorderReason.set('Reorder for coverage');
      component.saveReorder();
      component.saveReorder();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(component.reorderSaving()).toBe(true);
    });
  });
});
