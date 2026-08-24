import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';

/**
 * Página /register/payment-received: successUrl del Checkout de Stripe
 * (API_Contract.md §2.5). Puramente informativa — la cuenta se termina de
 * armar de forma async (webhook → email con RegistrationToken →
 * /register/complete), esta pantalla nunca llama al backend.
 */
@Component({
  selector: 'app-register-payment-received',
  imports: [RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register-payment-received.component.html',
})
export class RegisterPaymentReceivedComponent {
  protected readonly t = inject(TranslationStore).t;
}
