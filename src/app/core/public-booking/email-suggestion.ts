/**
 * Dominios de email mal escritos con más frecuencia y su corrección. Solo sugiere: el visitante decide.
 * Un email equivocado deja la demo sin código, así que vale la pena atajarlo antes de enviar.
 */
const FIXES: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'iclod.com': 'icloud.com',
  'icloud.con': 'icloud.com',
};

/** El email con el dominio corregido, o null si no hay nada que sugerir. */
export function emailSuggestion(email: string): string | null {
  const value = email.trim();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) {
    return null;
  }
  const fix = FIXES[value.slice(at + 1).toLowerCase()];
  return fix ? `${value.slice(0, at)}@${fix}` : null;
}
