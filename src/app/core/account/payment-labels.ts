import type { TranslationKeys } from '@core/i18n/translation.model';

/** Lo mínimo de una forma de pago del backend (cuenta u onboarding) para armar sus textos. */
export interface PayableOption {
  provider: string;
  method: string;
  displayName: string;
}

type PaymentKind = 'card' | 'bank' | 'brand';

/** Débitos bancarios del catálogo de PaymentApp (`PaymentMethodKind`). */
const BANK_METHODS = ['achdebit', 'sepadebit', 'bank'];

/** Iconos de marcas conocidas; una marca nueva cae al genérico de billetera. */
const BRAND_ICONS: Record<string, string> = { paypal: 'logo-paypal', apple: 'logo-apple', google: 'logo-google' };

/**
 * Los textos salen del TIPO de método, nunca del proveedor: así un procesador o una billetera nuevos no
 * tocan código. Tarjeta → "Pay $X" (el procesador no se nombra); banco → "Pay $X by bank"; el resto
 * (PayPal, Apple Pay, Venmo…) es una marca que quien paga reconoce → "Pay with {marca}".
 */
function kindOf(method: string): PaymentKind {
  const value = method.trim().toLowerCase();
  if (value === 'card') return 'card';
  return BANK_METHODS.includes(value) ? 'bank' : 'brand';
}

function brandName(option: PayableOption): string {
  return option.displayName?.trim() || option.provider;
}

/** Nombre de la forma de pago para quien paga. */
export function paymentMethodName(option: PayableOption, t: TranslationKeys): string {
  return kindOf(option.method) === 'card' ? t.payMethodCard : brandName(option);
}

/** Línea secundaria del selector; nunca menciona al procesador. */
export function paymentMethodHint(option: PayableOption, t: TranslationKeys): string {
  switch (kindOf(option.method)) {
    case 'card':
      return t.payMethodCardHint;
    case 'bank':
      return t.payMethodBankHint;
    default:
      return t.payMethodWalletHint.replace('{name}', brandName(option));
  }
}

export function paymentMethodIcon(option: PayableOption): string {
  switch (kindOf(option.method)) {
    case 'card':
      return 'card-outline';
    case 'bank':
      return 'business-outline';
    default:
      return BRAND_ICONS[brandName(option).toLowerCase().split(' ')[0]] ?? 'wallet-outline';
  }
}

/** Texto del botón que manda a pagar. Sin monto conocido (p. ej. puede cambiar con un código), sin cifra. */
export function payButtonLabel(option: PayableOption | null, amount: string | null, t: TranslationKeys): string {
  const kind = option ? kindOf(option.method) : 'card';
  if (kind === 'brand') return t.payButtonWith.replace('{name}', brandName(option!));
  if (kind === 'bank') return amount ? t.payButtonBankAmount.replace('{amount}', amount) : t.payButtonBank;
  return amount ? t.payButtonAmount.replace('{amount}', amount) : t.payButton;
}
