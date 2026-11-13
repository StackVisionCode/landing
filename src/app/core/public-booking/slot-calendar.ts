/**
 * Horarios de la demo vistos en la zona que elige el visitante (por defecto, la del navegador). La API solo
 * devuelve `startUtc`; los días y las horas se arman aquí con `Intl`, sin librerías.
 */
export interface SlotDay {
  /** `yyyy-mm-dd` en la zona elegida. */
  readonly key: string;
  readonly date: Date;
  readonly slots: readonly string[];
}

/** Ventana de horarios que se pide de una vez (el backend acepta hasta 14 días por consulta). */
export const WINDOW_DAYS = 14;

/** Agrupa los inicios por día local, en orden; cada día lleva sus horarios ordenados. */
export function groupByDay(startsUtc: readonly string[], timeZone: string): SlotDay[] {
  const days = new Map<string, { date: Date; slots: string[] }>();
  for (const start of [...startsUtc].sort()) {
    const date = new Date(start);
    const key = dayKey(date, timeZone);
    const day = days.get(key) ?? { date, slots: [] };
    day.slots.push(start);
    days.set(key, day);
  }
  return [...days.entries()].map(([key, day]) => ({ key, date: day.date, slots: day.slots }));
}

/** `yyyy-mm-dd` del instante en la zona (en-CA da ese formato). */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Los 14 días de la ventana, en la zona, empezando en `start`. */
export function windowDays(
  start: Date,
  timeZone: string,
  days = WINDOW_DAYS,
): { key: string; date: Date }[] {
  const result: { key: string; date: Date }[] = [];
  const seen = new Set<string>();
  // Paso de 12 h para no saltar ni repetir un día en los cambios de horario.
  for (let t = start.getTime(); result.length < days; t += 12 * 3_600_000) {
    const date = new Date(t);
    const key = dayKey(date, timeZone);
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ key, date });
    }
  }
  return result;
}

export function formatDay(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatDayShort(
  date: Date,
  timeZone: string,
  locale: string,
): { weekday: string; day: string; month: string } {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: part('weekday'), day: part('day'), month: part('month') };
}

export function formatTime(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    date,
  );
}

export function formatFullDate(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * "GMT-4", "GMT+5:30" o "GMT" del instante en la zona: el mismo formato que el correo (PublicBookingTime). La
 * ciudad sola confunde a quien vive en otro país con la misma hora (Windows da La Paz para todo UTC-4).
 */
export function gmtOffset(timeZone: string, at: Date): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (part && /^GMT([+-]\d{1,2}(:\d{2})?)?$/.test(part)) {
      // Algunos motores escriben "GMT+0"; el correo dice "GMT".
      return part.replace(/^GMT[+-]0(:00)?$/, 'GMT');
    }
  } catch {
    // Zona desconocida: se calcula abajo.
  }
  const local = new Date(at.toLocaleString('en-US', { timeZone }));
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const minutes = Math.round((local.getTime() - utc.getTime()) / 60_000);
  if (minutes === 0) {
    return 'GMT';
  }
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `GMT${minutes < 0 ? '-' : '+'}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** "New York" a partir de "America/New_York": legible y sin abreviaturas ambiguas. */
export function zoneLabel(timeZone: string): string {
  const city = timeZone.slice(timeZone.lastIndexOf('/') + 1).replace(/_/g, ' ');
  return city || timeZone;
}

/** Zonas que ofrece el selector: las del navegador si las expone, con la elegida siempre incluida. */
export function supportedZones(current: string): string[] {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function isValidZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
