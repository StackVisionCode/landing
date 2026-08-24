/**
 * Forma real de `GET {apiUrl}/plans` (Subscription.Api, PlansController) —
 * catálogo público para la landing, anónimo, cacheado 5 min en el backend.
 * Confirmado contra producción: no incluye plan gratuito, solo starter/pro/
 * enterprise.
 */
export interface PlanResponse {
  id: string;
  code: string;
  name: string;
  description: string;
  tier: string;
  monthlyPriceUsd: number;
  supportedBillingCycles: string[];
  pricesUsdByCycle: Record<string, number>;
  maxUsers: number;
  maxPendingInvitations: number;
  storageQuotaBytes: number;
  enabledModules: string[];
}
