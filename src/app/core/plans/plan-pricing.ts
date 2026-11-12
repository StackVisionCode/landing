import type { PlanResponse } from './plans.models';

/** Ahorro del ciclo anual frente a pagar 12 meses, calculado con los precios del catálogo. */
export interface AnnualSavings {
  amountUsd: number;
  percent: number;
}

/** Resumen de precio para el FAQ: un plan con sus dos ciclos o un rango mensual. */
export type PriceSummary =
  | { kind: 'one'; monthly: string; yearly: string | null }
  | { kind: 'range'; min: string; max: string };

export function formatUsd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function annualSavings(plan: PlanResponse): AnnualSavings | null {
  const monthly = plan.pricesUsdByCycle['Monthly'];
  const yearly = plan.pricesUsdByCycle['Yearly'];
  if (monthly == null || yearly == null || monthly <= 0) {
    return null;
  }
  const amount = monthly * 12 - yearly;
  if (amount <= 0) {
    return null;
  }
  return {
    amountUsd: Math.round(amount * 100) / 100,
    percent: Math.round((amount / (monthly * 12)) * 100),
  };
}

export function maxAnnualSavingsPercent(plans: readonly PlanResponse[]): number | null {
  const percents = plans
    .map(annualSavings)
    .filter((s): s is AnnualSavings => s !== null)
    .map((s) => s.percent);
  return percents.length ? Math.max(...percents) : null;
}

/** El orden lo fija el backend (`rank`); el precio solo desempata. */
export function byRank(a: PlanResponse, b: PlanResponse): number {
  return a.rank - b.rank || a.monthlyPriceUsd - b.monthlyPriceUsd;
}

export function priceSummary(plans: readonly PlanResponse[]): PriceSummary | null {
  if (plans.length === 0) {
    return null;
  }
  if (plans.length === 1) {
    const yearly = plans[0].pricesUsdByCycle['Yearly'];
    return {
      kind: 'one',
      monthly: formatUsd(plans[0].monthlyPriceUsd),
      yearly: yearly == null ? null : formatUsd(yearly),
    };
  }
  const monthly = plans.map((p) => p.monthlyPriceUsd);
  return {
    kind: 'range',
    min: formatUsd(Math.min(...monthly)),
    max: formatUsd(Math.max(...monthly)),
  };
}

export function storageLabel(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${Math.round(gb * 10) / 10} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
