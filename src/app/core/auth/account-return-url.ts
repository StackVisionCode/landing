/**
 * Destino al que volver después de entrar al Account. Sale de la URL —del guard, o del vale que manda el
 * espacio de trabajo—, así que solo se acepta una ruta del propio Account: cualquier otra cosa (un host
 * ajeno, `//otro.sitio`) convertiría la entrada en un redirect abierto.
 */
export function safeAccountReturnUrl(value: string | null | undefined): string {
  return value && /^\/account(\/|$)/.test(value) ? value : '/account';
}
