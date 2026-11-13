/**
 * "Add to Google Calendar", "Add to Outlook" y "Download .ics" armados en el navegador. El `.ics` usa el MISMO
 * UID y SEQUENCE que el del correo (`public-booking-{id}@{dominio}`, Notification `CalendarInviteBuilder`):
 * si el visitante agrega los dos, el calendario los ve como un solo evento.
 */
export interface DemoEvent {
  readonly title: string;
  readonly startUtc: string;
  readonly durationMinutes: number;
  readonly meetingUrl: string;
  readonly icsUid: string;
  readonly icsSequence: number;
  readonly organizerName: string;
}

export function googleCalendarUrl(event: DemoEvent): string {
  const { start, end } = range(event);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Join: ${event.meetingUrl}`,
    location: event.meetingUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: DemoEvent): string {
  const { start, end } = range(event);
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    enddt: end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    body: `Join: ${event.meetingUrl}`,
    location: event.meetingUrl,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Texto del `.ics` (RFC 5545): CRLF, escapes y líneas dobladas a 75 octetos. */
export function icsText(
  event: DemoEvent,
  domain: string,
  brand: string,
  organizerEmail: string,
  now: Date = new Date(),
): string {
  const { start, end } = range(event);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escape(brand)}//Meetings//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.icsUid}@${domain.trim().toLowerCase()}`,
    `DTSTAMP:${stamp(now)}`,
    `SEQUENCE:${event.icsSequence}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(`Join: ${event.meetingUrl}`)}`,
    `LOCATION:${escape(event.meetingUrl)}`,
    `URL:${event.meetingUrl}`,
    `ORGANIZER;CN=${quoteCn(event.organizerName)}:mailto:${organizerEmail}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsBlob(
  event: DemoEvent,
  domain: string,
  brand: string,
  organizerEmail: string,
): Blob {
  return new Blob([icsText(event, domain, brand, organizerEmail)], {
    type: 'text/calendar;charset=utf-8',
  });
}

function range(event: DemoEvent): { start: Date; end: Date } {
  const start = new Date(event.startUtc);
  return { start, end: new Date(start.getTime() + event.durationMinutes * 60_000) };
}

function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function quoteCn(name: string): string {
  const clean = name.replace(/"/g, '');
  return /[,;:]/.test(clean) ? `"${clean}"` : clean;
}

/** Dobla en 75 octetos UTF-8 sin partir un carácter. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
