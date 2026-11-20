import { OFFERED_MODULES, moduleIcon, moduleLabel } from './module-labels';

describe('moduleLabel', () => {
  // Wallet es un módulo base del catálogo: sin etiqueta, la tarjeta de precios mostraba "wallet".
  it('el monedero tiene nombre legible en los dos idiomas', () => {
    expect(moduleLabel('wallet', 'en')).toBe('Prepaid wallet');
    expect(moduleLabel('wallet', 'es')).toBe('Monedero prepago');
  });

  // Módulo comercial (Enterprise/Pro o add-on): nunca se muestra el código interno.
  it('financial_insights se llama Financial Insights, tiene ícono propio y se ofrece', () => {
    expect(moduleLabel('financial_insights', 'en')).toBe('Financial Insights');
    expect(moduleLabel('financial_insights', 'es')).toBe('Financial Insights');
    expect(moduleIcon('financial_insights')).not.toBe('apps-outline');
    expect(OFFERED_MODULES).toContain('financial_insights');
  });

  // Módulo comercial de Enterprise (o add-on): la tarjeta de precios mostraba "mileage".
  it('mileage tiene nombre legible en los dos idiomas, ícono propio y se ofrece', () => {
    expect(moduleLabel('mileage', 'en')).toBe('Mileage tracking');
    expect(moduleLabel('mileage', 'es')).toBe('Registro de millaje');
    expect(moduleIcon('mileage')).toBe('car-outline');
    expect(OFFERED_MODULES).toContain('mileage');
  });
});
