import { AccountPaymentOption } from './account-payment-options.service';

/** Nombre del proveedor para el usuario; vacío si no se sabe (compras de antes). */
export function checkoutProviderName(provider: string | null | undefined, cardLabel: string): string {
  if (provider === 'PayPal') return 'PayPal';
  if (provider === 'Stripe') return cardLabel;
  return '';
}

/** El otro método habilitado para pagar la compra abierta; null si no hay o no se sabe con cuál empezó. */
export function otherCheckoutOption(
  provider: string | null | undefined,
  options: readonly AccountPaymentOption[],
): AccountPaymentOption | null {
  if (provider !== 'PayPal' && provider !== 'Stripe') return null;
  return options.find(option => option.provider !== provider && (option.provider === 'PayPal' || option.provider === 'Stripe')) ?? null;
}
