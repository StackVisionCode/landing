import { en } from '@core/i18n/locales/en';
import { es } from '@core/i18n/locales/es';
import {
  payButtonLabel,
  paymentMethodHint,
  paymentMethodIcon,
  paymentMethodName,
} from './payment-labels';

const card = { provider: 'Stripe', method: 'Card', displayName: 'Card' };
const payPal = { provider: 'PayPal', method: 'Wallet', displayName: 'PayPal' };
const bank = { provider: 'Plaid', method: 'AchDebit', displayName: 'Bank account' };
// Un proveedor que hoy no existe: los textos salen de su tipo y su nombre, sin tocar código.
const venmo = { provider: 'Venmo', method: 'Wallet', displayName: 'Venmo' };
const otherCardProcessor = { provider: 'Adyen', method: 'Card', displayName: 'Adyen card' };

// El botón final dice qué hace: una tarjeta "Pay $X" (el procesador nunca se nombra); una marca "Pay with {marca}".
describe('payment-labels', () => {
  it('a card pays the amount and never names the processor', () => {
    expect(payButtonLabel(card, '$49.00', en)).toBe('Pay $49.00');
    expect(payButtonLabel(otherCardProcessor, '$49.00', en)).toBe('Pay $49.00');
    expect(payButtonLabel(card, null, en)).toBe('Pay');
    expect(paymentMethodName(card, en)).toBe('Credit or debit card');
    expect(paymentMethodName(otherCardProcessor, en)).toBe('Credit or debit card');
    expect(paymentMethodHint(card, en)).not.toContain('Stripe');
  });

  it('a wallet is named by its brand, today and in the future', () => {
    expect(payButtonLabel(payPal, '$49.00', en)).toBe('Pay with PayPal');
    expect(payButtonLabel(venmo, null, en)).toBe('Pay with Venmo');
    expect(paymentMethodName(payPal, en)).toBe('PayPal');
  });

  it('a bank debit pays the amount by bank', () => {
    expect(payButtonLabel(bank, '$49.00', en)).toBe('Pay $49.00 by bank');
    expect(payButtonLabel(bank, null, en)).toBe('Pay by bank');
  });

  it('without a chosen method the button just says Pay', () => {
    expect(payButtonLabel(null, '$49.00', en)).toBe('Pay $49.00');
  });

  it('speaks Spanish too', () => {
    expect(payButtonLabel(card, '$49.00', es)).toBe('Pagar $49.00');
    expect(payButtonLabel(payPal, null, es)).toBe('Pagar con PayPal');
    expect(paymentMethodName(card, es)).toBe('Tarjeta de crédito o débito');
  });

  it('picks the icon by method and brand', () => {
    expect(paymentMethodIcon(card)).toBe('card-outline');
    expect(paymentMethodIcon(payPal)).toBe('logo-paypal');
    expect(paymentMethodIcon(venmo)).toBe('wallet-outline');
    expect(paymentMethodIcon(bank)).toBe('business-outline');
  });

  it('the pending-purchase card label no longer names Stripe', () => {
    expect(en.accCheckoutProviderCard).toBe('card');
    expect(es.accCheckoutProviderCard).toBe('tarjeta');
  });
});
