/**
 * Cloudflare Turnstile cargado solo cuando el visitante llega a "Tus datos" (DEMO-08, R2): el script no
 * entra en la carga inicial del landing. La site key viene de la página de reservas, no del build.
 */
interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: 'interaction-only';
      callback: (token: string) => void;
      'error-callback': (code?: string) => void;
      'expired-callback': () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Misma acción que espera Calendar (`TurnstilePublicBookingBotCheck`). */
export const TURNSTILE_ACTION = 'public_booking';

let loading: Promise<TurnstileApi> | null = null;
/** Si Cloudflare no responde (red que lo corta), el visitante no debe esperar sin saberlo. */
const LOAD_TIMEOUT_MS = 8000;

export function loadTurnstile(
  doc: Document = document,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<TurnstileApi> {
  if (typeof window !== 'undefined' && window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = doc.createElement('script');
    // Quita el script para que el siguiente intento lo pida de nuevo.
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error('turnstile'));
    };
    const timer = setTimeout(fail, timeoutMs);
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        fail();
      }
    };
    script.onerror = fail;
    doc.head.appendChild(script);
  });
  return loading;
}

/** Solo para pruebas: olvida una carga en curso. */
export function resetTurnstileLoaderForTests(): void {
  loading = null;
}

/**
 * Widget invisible salvo que Cloudflare pida interacción. Entrega cada token nuevo: el token sirve una vez,
 * así que después de cada envío se pide otro con `reset`.
 */
export class TurnstileWidget {
  private api: TurnstileApi | null = null;
  private widgetId: string | null = null;
  private token: string | null = null;
  private waiters: ((token: string | null) => void)[] = [];
  /** El script no cargó: `next()` no espera un token que no va a llegar. */
  failed = false;

  async mount(container: HTMLElement, siteKey: string, timeoutMs?: number): Promise<void> {
    this.failed = false;
    try {
      this.api = await loadTurnstile(document, timeoutMs);
    } catch (error) {
      this.failed = true;
      throw error;
    }
    this.widgetId = this.api.render(container, {
      sitekey: siteKey,
      action: TURNSTILE_ACTION,
      appearance: 'interaction-only',
      callback: (token) => this.settle(token),
      'error-callback': (code) => {
        console.warn('Turnstile error', code);
        this.settle(null);
      },
      'expired-callback': () => (this.token = null),
    });
  }

  /** El token vigente, o espera el próximo (hasta `timeoutMs`). Null si Cloudflare no lo dio. */
  next(timeoutMs = 15000): Promise<string | null> {
    if (this.failed) {
      return Promise.resolve(null);
    }
    if (this.token) {
      const token = this.token;
      this.token = null;
      return Promise.resolve(token);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.waiters.push((token) => {
        clearTimeout(timer);
        resolve(token);
      });
    });
  }

  reset(): void {
    this.token = null;
    if (this.api && this.widgetId) {
      this.api.reset(this.widgetId);
    }
  }

  destroy(): void {
    if (this.api && this.widgetId) {
      this.api.remove(this.widgetId);
    }
    this.widgetId = null;
    this.waiters = [];
  }

  private settle(token: string | null): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(token);
      return;
    }
    this.token = token;
  }
}
