import { apiBaseFor, platformRuntime } from './platform-runtime';

/**
 * URLs de salida hacia el producto real y los IDs de calendario de
 * LeadConnector. Todo host público sale de PLATFORM_DOMAIN, que a su vez sale
 * del host que sirve el landing (ver platform-runtime): cambiar de dominio no
 * exige recompilar. La API no lleva sufijo /api: las rutas cuelgan directo de
 * la raíz (p.ej. GET /plans, POST /auth/login). Los IDs de booking son
 * placeholders — reemplazar por los reales de la cuenta de LeadConnector antes
 * de publicar.
 */
export const PLATFORM_DOMAIN = platformRuntime().domain;

/**
 * Nombre de la plataforma y su razón social, publicados por PlatformSettings (Tenant). `main.ts` los
 * lee antes de cargar la app, así que estas constantes ya nacen con la versión vigente. Nunca escritos
 * en un componente.
 */
export const PLATFORM_BRAND = platformRuntime().brandName;
export const PLATFORM_LEGAL_NAME = platformRuntime().legalName;

export const SITE_CONFIG = {
  apiUrl: apiBaseFor(typeof window === 'undefined' ? null : window.location.hostname),
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
