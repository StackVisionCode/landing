import { captureAttribution, readAttribution } from './attribution';
import { emailSuggestion } from './email-suggestion';
import { googleCalendarUrl, icsText, outlookCalendarUrl, type DemoEvent } from './calendar-links';
import { dayKey, gmtOffset, groupByDay, windowDays, zoneLabel } from './slot-calendar';

const EVENT: DemoEvent = {
  title: 'Book a live demo · TaxOffix',
  startUtc: '2026-11-18T15:00:00Z',
  durationMinutes: 30,
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  icsUid: 'public-booking-0f1e2d3c4b5a69788796a5b4c3d2e1f0',
  icsSequence: 2,
  organizerName: 'Pérez, María',
};

describe('Atribución de la visita', () => {
  beforeEach(() => sessionStorage.clear());

  it('guarda los utm_* y solo el dominio del referer externo', () => {
    captureAttribution(
      '?utm_source=google&utm_medium=cpc&utm_campaign=fall',
      'https://www.bing.com/search?q=tax',
      'taxoffix.io',
      sessionStorage,
    );

    expect(readAttribution(sessionStorage)).toEqual({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'fall',
      referrerDomain: 'bing.com',
    });
  });

  it('cuenta la primera llegada: una navegación interna no la pisa', () => {
    captureAttribution('?utm_source=newsletter', '', 'taxoffix.io', sessionStorage);
    captureAttribution(
      '?utm_source=other',
      'https://taxoffix.io/register',
      'taxoffix.io',
      sessionStorage,
    );

    expect(readAttribution(sessionStorage).utmSource).toBe('newsletter');
  });

  it('el referer del propio sitio no es atribución y un valor largo se descarta', () => {
    captureAttribution(
      `?utm_campaign=${'x'.repeat(101)}`,
      'https://www.taxoffix.io/',
      'www.taxoffix.io',
      sessionStorage,
    );

    expect(readAttribution(sessionStorage)).toEqual({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrerDomain: null,
    });
  });
});

describe('Enlaces de calendario', () => {
  it('el .ics usa el mismo UID y SEQUENCE que el correo', () => {
    const ics = icsText(
      EVENT,
      'TaxOffix.io',
      'TaxOffix',
      'support@taxoffix.io',
      new Date('2026-11-12T12:00:00Z'),
    );

    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('UID:public-booking-0f1e2d3c4b5a69788796a5b4c3d2e1f0@taxoffix.io\r\n');
    expect(ics).toContain('SEQUENCE:2\r\n');
    expect(ics).toContain('DTSTART:20261118T150000Z\r\n');
    expect(ics).toContain('DTEND:20261118T153000Z\r\n');
    expect(ics).toContain('METHOD:PUBLISH\r\n');
    expect(ics).toContain('ORGANIZER;CN="Pérez, María":mailto:support@taxoffix.io\r\n');
    expect(ics.replace(/\r\n /g, '')).toContain('SUMMARY:Book a live demo · TaxOffix\r\n');
    // Ninguna línea pasa de 75 octetos.
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('Google y Outlook reciben el horario en UTC y el enlace de la reunión', () => {
    const google = new URL(googleCalendarUrl(EVENT));
    const outlook = new URL(outlookCalendarUrl(EVENT));

    expect(google.searchParams.get('dates')).toBe('20261118T150000Z/20261118T153000Z');
    expect(google.searchParams.get('location')).toBe(EVENT.meetingUrl);
    expect(outlook.searchParams.get('startdt')).toBe('2026-11-18T15:00:00Z');
    expect(outlook.searchParams.get('enddt')).toBe('2026-11-18T15:30:00Z');
  });
});

describe('Horarios por zona', () => {
  const starts = ['2026-11-19T02:00:00Z', '2026-11-18T15:00:00Z', '2026-11-18T16:00:00Z'];

  it('agrupa por día en la zona elegida', () => {
    const ny = groupByDay(starts, 'America/New_York');
    expect(ny.map((day) => day.key)).toEqual(['2026-11-18']);
    expect(ny[0].slots).toEqual([
      '2026-11-18T15:00:00Z',
      '2026-11-18T16:00:00Z',
      '2026-11-19T02:00:00Z',
    ]);
  });

  it('cambiar la zona mueve los horarios al día local que corresponde', () => {
    const madrid = groupByDay(starts, 'Europe/Madrid');
    expect(madrid.map((day) => day.key)).toEqual(['2026-11-18', '2026-11-19']);
    expect(madrid[1].slots).toEqual(['2026-11-19T02:00:00Z']);
  });

  it('la ventana tiene 14 días seguidos sin saltos en el cambio de horario', () => {
    const days = windowDays(new Date('2026-10-30T12:00:00Z'), 'America/New_York');
    expect(days.length).toBe(14);
    expect(days[0].key).toBe('2026-10-30');
    expect(days[13].key).toBe('2026-11-12');
    expect(dayKey(days[3].date, 'America/New_York')).toBe('2026-11-02');
  });

  it('la zona se nombra por su ciudad', () => {
    expect(zoneLabel('America/New_York')).toBe('New York');
    expect(zoneLabel('UTC')).toBe('UTC');
  });

  it('el desfase es el del día de la demo, con horario de verano y medias horas (igual que el correo)', () => {
    const november = new Date('2026-11-13T13:00:00Z');
    const july = new Date('2026-07-13T13:00:00Z');

    expect(gmtOffset('America/La_Paz', november)).toBe('GMT-4');
    expect(gmtOffset('America/New_York', november)).toBe('GMT-5');
    expect(gmtOffset('America/New_York', july)).toBe('GMT-4');
    expect(gmtOffset('Asia/Kolkata', november)).toBe('GMT+5:30');
    expect(gmtOffset('Europe/London', november)).toBe('GMT');
  });
});

describe('Sugerencia de email', () => {
  it('corrige los dominios mal escritos más comunes', () => {
    expect(emailSuggestion('jane@gmial.com')).toBe('jane@gmail.com');
    expect(emailSuggestion('jane@gmail.con')).toBe('jane@gmail.com');
    expect(emailSuggestion('Jane@Hotmial.com')).toBe('Jane@hotmail.com');
    expect(emailSuggestion('jane@outlok.com')).toBe('jane@outlook.com');
    expect(emailSuggestion('jane@yaho.com')).toBe('jane@yahoo.com');
  });

  it('no sugiere nada con un dominio correcto o desconocido', () => {
    expect(emailSuggestion('jane@gmail.com')).toBeNull();
    expect(emailSuggestion('jane@acme-tax.com')).toBeNull();
    expect(emailSuggestion('jane')).toBeNull();
  });
});
