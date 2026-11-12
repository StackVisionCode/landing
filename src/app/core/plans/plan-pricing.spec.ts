import type { PlanResponse } from './plans.models';
import { annualSavings, byRank, maxAnnualSavingsPercent, priceSummary } from './plan-pricing';

function plan(code: string, monthly: number, yearly: number | null, rank: number): PlanResponse {
  return {
    id: `${code}-id`,
    code,
    name: code,
    description: '',
    tier: 'Pro',
    monthlyPriceUsd: monthly,
    supportedBillingCycles: yearly === null ? ['Monthly'] : ['Monthly', 'Yearly'],
    pricesUsdByCycle: yearly === null ? { Monthly: monthly } : { Monthly: monthly, Yearly: yearly },
    maxUsers: 3,
    maxPendingInvitations: 5,
    storageQuotaBytes: 15 * 1024 ** 3,
    enabledModules: [],
    rank,
    isFeatured: false,
  };
}

describe('plan-pricing', () => {
  it('calcula el ahorro anual con los precios del catálogo', () => {
    expect(annualSavings(plan('enterprise', 99, 999, 3))).toEqual({ amountUsd: 189, percent: 16 });
  });

  it('sin precio anual no hay ahorro que mostrar', () => {
    expect(annualSavings(plan('enterprise', 99, null, 3))).toBeNull();
  });

  it('el badge del toggle usa el mayor ahorro de los planes', () => {
    expect(maxAnnualSavingsPercent([plan('a', 99, 999, 3), plan('b', 50, 500, 1)])).toBe(17);
    expect(maxAnnualSavingsPercent([plan('a', 99, null, 3)])).toBeNull();
  });

  it('ordena por el rango que fija el backend, no por el precio', () => {
    const sorted = [plan('cheap', 10, 100, 3), plan('expensive', 99, 999, 1)].sort(byRank);
    expect(sorted.map((p) => p.code)).toEqual(['expensive', 'cheap']);
  });

  it('resume el precio: un plan con sus dos ciclos, varios como rango mensual', () => {
    expect(priceSummary([plan('enterprise', 99, 999, 3)])).toEqual({
      kind: 'one',
      monthly: '$99',
      yearly: '$999',
    });
    expect(priceSummary([plan('a', 99, 999, 3), plan('b', 39, 399, 1)])).toEqual({
      kind: 'range',
      min: '$39',
      max: '$99',
    });
    expect(priceSummary([])).toBeNull();
  });
});
