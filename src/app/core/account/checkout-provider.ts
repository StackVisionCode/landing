import { AccountPaymentOption } from './account-payment-options.service';

/**
 * Nombre para quien paga del proveedor con el que empezó una compra: "card" si es una tarjeta (el procesador
 * no se nombra), si no su marca. Sale del catálogo; las compras de antes sin catálogo caen a lo conocido.
 */
export function checkoutProviderName(
  provider: string | null | undefined,
  cardLabel: string,
  options: readonly AccountPaymentOption[] = [],
): string {
  if (!provider) return '';
  const option = options.find(item => item.provider === provider);
  if (option) return option.method.toLowerCase() === 'card' ? cardLabel : option.displayName?.trim() || provider;
  if (provider === 'Stripe') return cardLabel;
  return provider === 'PayPal' ? 'PayPal' : '';
}

/** Otro método habilitado para pagar la compra abierta; null si no hay o no se sabe con cuál empezó. */
export function otherCheckoutOption(
  provider: string | null | undefined,
  options: readonly AccountPaymentOption[],
): AccountPaymentOption | null {
  if (!provider) return null;
  return options.find(option => option.provider !== provider) ?? null;
}
