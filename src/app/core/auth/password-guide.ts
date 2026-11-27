/**
 * Guía en vivo de la contraseña nueva: espejo de PasswordPolicy del backend (Auth/Application/Common/PasswordPolicy.cs),
 * sin reglas de composición (NIST, D-13); mismas reglas que el CRM y el portal. Los textos los pone
 * `app-password-guide` con el i18n de la landing. El backend sigue siendo la autoridad.
 */

export type PasswordGuideRuleId =
  'length' | 'maxLength' | 'common' | 'email' | 'context' | 'current' | 'match';

export interface PasswordGuideRule {
  id: PasswordGuideRuleId;
  met: boolean;
  /** Solo en `length`: caracteres escritos y mínimo. */
  count?: number;
  min?: number;
  /** Solo en `context`: la pantalla pasó el nombre de la oficina. */
  office?: boolean;
}

export interface PasswordGuideInput {
  password: string | null | undefined;
  /** 15 sin MFA, 12 con MFA (D-13). */
  minLength: number;
  /** Correo de la cuenta; sin él no hay regla de correo. */
  email?: string | null;
  /** Oficina y subdominio que la pantalla conoce. La marca de la plataforma va siempre. */
  contextWords?: readonly (string | null | undefined)[];
  /** Lo escrito en "contraseña actual"; `undefined` = la pantalla no la pide. */
  current?: string | null;
  /** Lo escrito en la confirmación; `undefined` = la pantalla no tiene confirmación. */
  confirm?: string | null;
}

export const PASSWORD_GUIDE_MAX_LENGTH = 128;

// Mismas palabras de marca que PasswordPolicy.BrandWords.
const BRAND_WORDS = ['taxoffix', 'taxvision'];

// Las más obvias de CommonPasswordList (palabras base que no sirven aunque lleven números o símbolos).
const COMMON_BASE_WORDS = new Set([
  'password',
  'passw',
  'passwd',
  'passphrase',
  'qwerty',
  'qwertyuiop',
  'welcome',
  'letmein',
  'changeme',
  'iloveyou',
  'admin',
  'administrator',
  'secret',
  'default',
  'temporary',
  'temporal',
]);

// Algunas exactas de CommonPasswordList que la regla de palabra base no atrapa.
const COMMON_EXACT = new Set([
  'passwordpassword',
  'iloveyouiloveyou',
  'letmeinletmein',
  'welcomewelcome',
  'correcthorsebatterystaple',
  'thequickbrownfox',
]);

// Secuencias de PasswordPolicy: cualquier tramo de 8 dentro de ellas es trivial.
const SEQUENCES = [
  '01234567890123456789',
  '98765432109876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiopasdfghjklzxcvbnm',
  '1qaz2wsx3edc4rfv5tgb6yhn',
];

export function passwordGuideRules(input: PasswordGuideInput): PasswordGuideRule[] {
  const raw = input.password ?? '';
  const normalized = raw.normalize('NFKC');
  const lower = normalized.toLowerCase();
  const filled = raw.length > 0;
  const count = normalized.length;
  const tooLong = count > PASSWORD_GUIDE_MAX_LENGTH;

  const rules: PasswordGuideRule[] = [
    { id: 'length', met: count >= input.minLength && !tooLong, count, min: input.minLength },
  ];
  // El máximo solo se avisa cuando se pasa.
  if (tooLong) rules.push({ id: 'maxLength', met: false });
  rules.push({ id: 'common', met: filled && !isCommonPassword(lower) });

  const emailLocal = (input.email ?? '').trim().split('@')[0].toLowerCase();
  // Como el backend: una parte local de menos de 4 letras no bloquea nada.
  if (emailLocal.length >= 4) rules.push({ id: 'email', met: filled && !lower.includes(emailLocal) });

  const officeTokens = contextTokens(input.contextWords ?? []);
  rules.push({
    id: 'context',
    met: filled && ![...BRAND_WORDS, ...officeTokens].some((token) => lower.includes(token)),
    office: officeTokens.length > 0,
  });

  if (input.current !== undefined)
    rules.push({ id: 'current', met: filled && raw !== (input.current ?? '') });
  if (input.confirm !== undefined)
    rules.push({ id: 'match', met: filled && raw === (input.confirm ?? '') });
  return rules;
}

/** Todas las reglas verificables en el front están cumplidas. */
export function passwordGuideMet(rules: readonly PasswordGuideRule[]): boolean {
  return rules.length > 0 && rules.every((rule) => rule.met);
}

/** Común exacta, palabra base rodeada solo de números/símbolos, 1–2 caracteres repetidos o tramo de secuencia. */
export function isCommonPassword(lower: string): boolean {
  if (COMMON_EXACT.has(lower)) return true;
  const core = lower.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (core.length >= 4 && COMMON_BASE_WORDS.has(core)) return true;
  if (new Set(lower).size <= 2) return true;
  for (let start = 0; start + 8 <= lower.length; start++) {
    const window = lower.substring(start, start + 8);
    if (SEQUENCES.some((sequence) => sequence.includes(window))) return true;
  }
  return false;
}

// Cada palabra de 4+ letras del contexto y el texto completo compacto (igual que el backend).
function contextTokens(words: readonly (string | null | undefined)[]): string[] {
  const tokens = new Set<string>();
  for (const word of words) {
    if (!word?.trim()) continue;
    const lower = word.normalize('NFKC').toLowerCase();
    for (const part of lower.split(/[ \-_.,]+/)) {
      if (part.length >= 4) tokens.add(part);
    }
    const compact = Array.from(lower)
      .filter((c) => /[\p{L}\p{N}]/u.test(c))
      .join('');
    if (compact.length >= 4) tokens.add(compact);
  }
  return [...tokens];
}
