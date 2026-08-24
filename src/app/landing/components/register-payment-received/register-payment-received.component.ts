import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';

interface ConfettiPiece {
  left: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
  size: number;
}

const CONFETTI_COLORS = ['#67BAF4', '#1E466B', '#8CC7F5', '#FFFFFF', '#F5B942'];
const CONFETTI_COUNT = 44;

/**
 * Página /register/payment-received: successUrl del Checkout de Stripe
 * (API_Contract.md §2.5). Puramente informativa — la cuenta se termina de
 * armar de forma async (webhook → email con RegistrationToken →
 * /register/complete), esta pantalla nunca llama al backend. Mismo layout
 * split-panel que /register y /register/complete, con un confetti de
 * bienvenida (único, no en loop — respeta prefers-reduced-motion).
 */
@Component({
  selector: 'app-register-payment-received',
  imports: [RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register-payment-received.component.html',
  styleUrl: './register-payment-received.component.css',
})
export class RegisterPaymentReceivedComponent {
  protected readonly t = inject(TranslationStore).t;

  /** Generado una sola vez por vista — no hace falta que sea reactivo. */
  protected readonly confetti: ConfettiPiece[] = Array.from({ length: CONFETTI_COUNT }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.6 + Math.random() * 1.8,
    rotation: Math.random() * 360,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 6 + Math.random() * 6,
  }));
}
