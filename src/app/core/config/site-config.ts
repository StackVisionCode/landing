/**
 * URLs de salida hacia el producto real (TaxVsion_Front / StackTaxVision) y
 * los IDs de calendario de LeadConnector. Los IDs de booking son placeholders
 * — reemplazar por los reales de la cuenta de LeadConnector antes de publicar.
 */
export const SITE_CONFIG = {
  apiUrl: 'https://api.stacktaxvision.com/api',
  appUrl: 'https://app.stacktaxvision.com',
  clientPortalUrl: 'https://client.stacktaxvision.com',
  booking: {
    hero: 'REPLACE_ME_HERO_BOOKING_ID',
    cta: 'REPLACE_ME_CTA_BOOKING_ID',
    faq: 'REPLACE_ME_FAQ_BOOKING_ID',
  },
} as const;
