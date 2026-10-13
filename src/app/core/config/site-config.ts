/**
 * URLs de salida hacia el producto real y los IDs de calendario de
 * LeadConnector. Todo host público sale de PLATFORM_DOMAIN: cambiar de dominio
 * es cambiar esa línea, no buscar URLs sueltas por el código. La API no lleva
 * sufijo /api: las rutas cuelgan directo de la raíz (p.ej. GET /plans,
 * POST /auth/login). Los IDs de booking son placeholders — reemplazar por los
 * reales de la cuenta de LeadConnector antes de publicar.
 */
export const PLATFORM_DOMAIN = 'taxoffix.io';

/** Nombre de la plataforma y su razón social. Igual que el dominio: un solo lugar, nunca escritos en un componente. */
export const PLATFORM_BRAND = 'TaxOffix';
export const PLATFORM_LEGAL_NAME = 'TaxOffix LLC';

const productionApiUrl = `https://api.${PLATFORM_DOMAIN}`;
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
  websiteUrl: `https://${PLATFORM_DOMAIN}`,
  appUrl: `https://app.${PLATFORM_DOMAIN}`,
  clientPortalUrl: `https://client.${PLATFORM_DOMAIN}`,
  /** Lo que sigue al slug en el host de una oficina (`.<dominio>`). */
  subdomainSuffix: `.${PLATFORM_DOMAIN}`,
  booking: {
    hero: 'REPLACE_ME_HERO_BOOKING_ID',
    cta: 'REPLACE_ME_CTA_BOOKING_ID',
    faq: 'REPLACE_ME_FAQ_BOOKING_ID',
  },
} as const;

/** Espacio de trabajo de una oficina: `https://<slug>.<dominio>`. */
export function officeWorkspaceUrl(slug: string): string {
  return `https://${slug}${SITE_CONFIG.subdomainSuffix}`;
}
