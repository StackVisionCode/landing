import { computed, signal } from '@angular/core';

/**
 * Bloqueo temporal de una acción (un botón) mientras dura la espera que pidió el backend. La acción nunca
 * se reintenta sola: al terminar la cuenta, el usuario vuelve a pulsar. El formulario no se toca.
 */
export class ActionCooldown {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly remaining = signal(0);

  readonly secondsLeft = this.remaining.asReadonly();
  readonly active = computed(() => this.remaining() > 0);

  start(seconds: number): void {
    this.stop();
    const total = Math.max(1, Math.ceil(seconds));
    const endsAt = Date.now() + total * 1000;
    this.remaining.set(total);
    // Se recalcula contra el reloj: un tab en segundo plano no atrasa la cuenta.
    this.timerId = setInterval(() => {
      const left = Math.ceil((endsAt - Date.now()) / 1000);
      if (left <= 0) {
        this.stop();
        return;
      }
      this.remaining.set(left);
    }, 1000);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.remaining.set(0);
  }
}
