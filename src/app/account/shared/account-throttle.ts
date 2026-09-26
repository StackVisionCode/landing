import { ActionCooldown } from '@core/http/action-cooldown';
import { readThrottle } from '@core/http/throttling';
import { TranslationKeys } from '@core/i18n/translation.model';

/**
 * Un 429 no es un fallo: es "espera y vuelve". Las acciones del Account que arrancan un cobro viven en la
 * categoría más estrecha del catálogo, así que se alcanza con solo insistir, y contarlo como error dejaba
 * al usuario sin saber cuánto esperar. Arranca la cuenta atrás del botón y devuelve el aviso; null si el
 * error era otra cosa y le toca decidir a la pantalla.
 */
export function throttleNotice(err: unknown, cooldown: ActionCooldown, t: TranslationKeys): string | null {
  const throttle = readThrottle(err);
  if (!throttle) {
    return null;
  }
  cooldown.start(throttle.retryAfterSeconds);
  return throttle.kind === 'overloaded' ? t.accBusy : t.accTooMany;
}
