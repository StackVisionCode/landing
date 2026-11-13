/**
 * Atribución de la visita para "Book a live demo": los `utm_*` con los que llegó y solo el dominio del
 * referer (nunca la URL completa). Se guarda al entrar en `sessionStorage`, así sobrevive a la navegación
 * dentro del landing pero no a otra visita. Un valor ya guardado no se pisa: cuenta la primera llegada.
 */
export interface VisitAttribution {
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly referrerDomain: string | null;
}

const STORAGE_KEY = 'tpo.demo.attribution.v1';
// Mismo tope que el backend (UtmValue y dominio).
const MAX_LENGTH = 100;

export const EMPTY_ATTRIBUTION: VisitAttribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referrerDomain: null,
};

/** Lee la llegada actual y la guarda si todavía no había una. Nunca lanza. */
export function captureAttribution(
  search: string,
  referrer: string,
  ownHost: string,
  storage: Storage | null,
): void {
  if (!storage) {
    return;
  }
  try {
    if (storage.getItem(STORAGE_KEY)) {
      return;
    }
    const params = new URLSearchParams(search);
    const attribution: VisitAttribution = {
      utmSource: clean(params.get('utm_source')),
      utmMedium: clean(params.get('utm_medium')),
      utmCampaign: clean(params.get('utm_campaign')),
      referrerDomain: externalDomain(referrer, ownHost),
    };
    if (Object.values(attribution).some((value) => value !== null)) {
      storage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    }
  } catch {
    // Storage bloqueado: sin atribución.
  }
}

export function readAttribution(storage: Storage | null): VisitAttribution {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_ATTRIBUTION;
    }
    const parsed = JSON.parse(raw) as Partial<Record<keyof VisitAttribution, unknown>>;
    return {
      utmSource: clean(parsed.utmSource),
      utmMedium: clean(parsed.utmMedium),
      utmCampaign: clean(parsed.utmCampaign),
      referrerDomain: clean(parsed.referrerDomain),
    };
  } catch {
    return EMPTY_ATTRIBUTION;
  }
}

/** `sessionStorage` si existe (no en el prerender ni con el storage bloqueado). */
export function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_LENGTH ? trimmed : null;
}

/** Solo el host del referer, y solo si es de otro sitio: la navegación interna no es atribución. */
function externalDomain(referrer: string, ownHost: string): string | null {
  if (!referrer) {
    return null;
  }
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    const own = ownHost.toLowerCase().replace(/^www\./, '');
    return host && host !== own ? clean(host) : null;
  } catch {
    return null;
  }
}
