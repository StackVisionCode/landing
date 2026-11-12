import { moduleLabel } from './module-labels';

describe('moduleLabel', () => {
  // Wallet es un módulo base del catálogo: sin etiqueta, la tarjeta de precios mostraba "wallet".
  it('el monedero tiene nombre legible en los dos idiomas', () => {
    expect(moduleLabel('wallet', 'en')).toBe('Prepaid wallet');
    expect(moduleLabel('wallet', 'es')).toBe('Monedero prepago');
  });
});
