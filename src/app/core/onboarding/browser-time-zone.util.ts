/**
 * Zona horaria IANA del navegador (p. ej. "America/New_York") para proponerla al crear la oficina.
 * Es solo una sugerencia: si el entorno no la expone (SSR, navegador viejo) devuelve `undefined`
 * y el backend crea la oficina en UTC. Nunca lanza.
 */
export function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.trim().length > 0 ? zone : undefined;
  } catch {
    return undefined;
  }
}
