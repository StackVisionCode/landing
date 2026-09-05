/**
 * URLs de salida hacia el producto real y los IDs de calendario de
 * LeadConnector. El dominio real en producción es taxproffice.com (no
 * stacktaxvision.com, que no resuelve) — confirmado pegándole directo a cada
 * subdominio. La API tampoco lleva sufijo /api: las rutas cuelgan directo de
 * la raíz (p.ej. GET /plans, POST /auth/login). Los IDs de booking son
 * placeholders — reemplazar por los reales de la cuenta de LeadConnector
 * antes de publicar.
 */
const productionApiUrl = 'https://api.taxproffice.com';
const localApiUrl = 'http://localhost:5047';

function resolveApiUrl(): string {
  if (typeof window === 'undefined') {
    return productionApiUrl;
  }

  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? localApiUrl
    : productionApiUrl;
}

export const SITE_CONFIG = {
  apiUrl: resolveApiUrl(),
  appUrl: 'https://app.taxproffice.com',
  clientPortalUrl: 'https://client.taxproffice.com',
  booking: {
    hero: 'REPLACE_ME_HERO_BOOKING_ID',
    cta: 'REPLACE_ME_CTA_BOOKING_ID',
    faq: 'REPLACE_ME_FAQ_BOOKING_ID',
  },
} as const;
