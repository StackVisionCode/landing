import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PlansService } from '@core/plans/plans.service';
import type { PlanResponse } from '@core/plans/plans.models';
import { PricingComponent } from './pricing.component';

function plan(code: string, monthly: number, rank: number, isFeatured = false, enabledModules: string[] = []): PlanResponse {
  return {
    id: `${code}-id`,
    code,
    name: code.toUpperCase(),
    description: '',
    tier: 'Pro',
    monthlyPriceUsd: monthly,
    supportedBillingCycles: ['Monthly', 'Yearly'],
    pricesUsdByCycle: { Monthly: monthly, Yearly: monthly * 10 + 9 },
    maxUsers: 3,
    maxPendingInvitations: 5,
    storageQuotaBytes: 15 * 1024 ** 3,
    enabledModules,
    rank,
    isFeatured,
  };
}

describe('PricingComponent', () => {
  function create(plans: PlanResponse[]) {
    TestBed.configureTestingModule({
      imports: [PricingComponent],
      providers: [
        provideRouter([]),
        { provide: PlansService, useValue: { getPlans: () => of(plans) } },
      ],
    });
    const fixture = TestBed.createComponent(PricingComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    return { fixture, page, cards: () => Array.from(page.querySelectorAll('[data-plan-card]')) };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('con un solo plan muestra una tarjeta centrada y más ancha', () => {
    const { page, cards } = create([plan('enterprise', 99, 3, true)]);

    expect(cards().length).toBe(1);
    expect(page.querySelector('[data-plan-grid]')!.className).toContain('max-w-md');
  });

  it('con dos planes usa dos columnas y con tres, tres', () => {
    expect(
      create([plan('a', 10, 1), plan('b', 20, 2)]).page.querySelector('[data-plan-grid]')!
        .className,
    ).toContain('md:grid-cols-2');
    TestBed.resetTestingModule();
    expect(
      create([plan('a', 10, 1), plan('b', 20, 2), plan('c', 30, 3)]).page.querySelector(
        '[data-plan-grid]',
      )!.className,
    ).toContain('lg:grid-cols-3');
  });

  it('el destacado sale del dato isFeatured, no del código del plan', () => {
    const { cards } = create([plan('pro', 69, 2), plan('gold', 99, 3, true)]);

    const highlighted = cards().filter((card) => card.classList.contains('bg-twilight'));
    expect(highlighted.map((card) => card.querySelector('h3')!.textContent!.trim())).toEqual([
      'GOLD',
    ]);
  });

  it('muestra el almacenamiento del plan', () => {
    const { page } = create([plan('enterprise', 99, 3, true)]);

    expect(page.textContent).toContain('15 GB');
  });

  it('el ahorro anual se calcula con los precios del catálogo', () => {
    const { page } = create([plan('enterprise', 99, 3, true)]);

    expect(page.textContent).toContain('16');
    expect(page.textContent).not.toContain('2 months free');
    expect(page.textContent).not.toContain('2 meses gratis');
  });

  it('un plan con Financial Insights lo nombra, sin el código interno', () => {
    const { page } = create([plan('enterprise', 99, 3, true, ['customers', 'financial_insights'])]);

    expect(page.textContent).toContain('Financial Insights');
    expect(page.textContent).not.toContain('financial_insights');
  });
});
