/**
 * Link de referido (?referral=&ch=&sid=). Se guarda al llegar, en cualquier página, así sobrevive a pasar por los
 * planes. Todo viene de la URL: lo que no tiene forma posible se descarta (mismas reglas que valida el backend).
 */
export interface ReferralLink {
  code: string;
  channel?: string;
  shareId?: string;
}

const STORAGE_KEY = 'taxoffix.referral-link';
const CODE_PATTERN = /^[A-Za-z0-9-]{4,32}$/;
const CHANNEL_PATTERN = /^[a-z]{2,20}$/;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ParamReader {
  get(name: string): string | null;
}

/** El link de los parámetros, validado; null si no trae un código con forma posible. */
export function parseReferralLink(params: ParamReader): ReferralLink | null {
  return sanitize(params.get('referral'), params.get('ch'), params.get('sid'));
}

export function captureReferralLink(search: string, storage: Storage | null): void {
  const link = parseReferralLink(new URLSearchParams(search));
  if (!link || !storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(link));
  } catch {
    // Sin storage el link sigue funcionando en la misma página.
  }
}

export function clearReferralLink(storage: Storage | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Sin storage no hay nada guardado.
  }
}

export function readReferralLink(storage: Storage | null): ReferralLink | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<ReferralLink>;
    return sanitize(stored.code ?? null, stored.channel ?? null, stored.shareId ?? null);
  } catch {
    return null;
  }
}

function sanitize(code: string | null, channel: string | null, shareId: string | null): ReferralLink | null {
  const trimmedCode = code?.trim() ?? '';
  if (!CODE_PATTERN.test(trimmedCode)) return null;
  const cleanChannel = channel?.trim().toLowerCase() ?? '';
  const cleanShare = shareId?.trim() ?? '';
  return {
    code: trimmedCode,
    channel: CHANNEL_PATTERN.test(cleanChannel) ? cleanChannel : undefined,
    shareId: GUID_PATTERN.test(cleanShare) ? cleanShare : undefined,
  };
}
