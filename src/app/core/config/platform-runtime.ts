/**
 * Dominio, nombre y razón social de la plataforma tal como los publica Tenant (PlatformSettings). Este
 * módulo NO importa nada de la app: `main.ts` lo usa para leer la versión vigente ANTES de cargar la app,
 * así `site-config` (y todo lo que arma textos con la marca) ya nace con los valores de runtime.
 *
 * - Dominio: sale del host que sirve el landing (apex o `www.`), así el mismo build sirve cualquier dominio.
 * - Marca y razón social: de `GET https://api.{dominio}/platform/settings/public`.
 * - Sin navegador (prerender) o sin respuesta: los valores de respaldo de abajo.
 */
export interface PlatformRuntime {
  readonly domain: string;
  readonly brandName: string;
  readonly legalName: string;
}

export const PLATFORM_FALLBACK: PlatformRuntime = {
  domain: 'taxoffix.io',
  brandName: 'TaxOffix',
  legalName: 'TaxOffix LLC',
};

let current: PlatformRuntime = { ...PLATFORM_FALLBACK, domain: domainFromHost(currentHostname()) };

export function platformRuntime(): PlatformRuntime {
  return current;
}

/** Dominio de la plataforma a partir del host del landing; null-safe y con respaldo. */
export function domainFromHost(hostname: string | null): string {
  const host = (hostname ?? '').trim().toLowerCase().replace(/\.+$/, '');
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2 || host === 'localhost' || labels.every((label) => /^\d+$/.test(label))) {
    return PLATFORM_FALLBACK.domain;
  }
  return labels[0] === 'www' ? labels.slice(1).join('.') : host;
}

/** Aplica marca y razón social publicadas. Ignora valores vacíos. */
export function applyPlatformSettings(settings: { brandName?: unknown; legalName?: unknown }): void {
  const brandName = typeof settings.brandName === 'string' ? settings.brandName.trim() : '';
  const legalName = typeof settings.legalName === 'string' ? settings.legalName.trim() : '';
  current = {
    ...current,
    brandName: brandName || current.brandName,
    legalName: legalName || current.legalName,
  };
}

/**
 * Lee la versión vigente. Nunca falla ni tarda más de `timeoutMs`: si la API no contesta, el landing
 * arranca con los valores de respaldo.
 */
export async function loadPlatformRuntime(apiBase: string, timeoutMs = 2000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase.replace(/\/+$/, '')}/platform/settings/public`, {
      signal: controller.signal,
    });
    if (response.ok) {
      applyPlatformSettings(await response.json());
    }
  } catch {
    // Sin API: respaldo.
  } finally {
    clearTimeout(timer);
  }
}

/** Base de la API para el host actual: el gateway local en localhost, `api.{dominio}` en el resto. */
export function apiBaseFor(hostname: string | null): string {
  const host = (hostname ?? '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' ? 'http://localhost:5047' : `https://api.${domainFromHost(hostname)}`;
}

/** Solo tests. */
export function resetPlatformRuntimeForTests(hostname: string | null = null): void {
  current = { ...PLATFORM_FALLBACK, domain: domainFromHost(hostname) };
}

function currentHostname(): string | null {
  return typeof window === 'undefined' ? null : window.location.hostname;
}
