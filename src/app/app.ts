import { Component, afterNextRender, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PLATFORM_BRAND } from '@core/config/site-config';
import { captureAttribution, sessionStore } from '@core/public-booking/attribution';
import { captureReferralLink } from '@core/referrals/referral-link';
import { reloadOnBackForwardRestore } from '@core/http/back-forward-restore';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal(PLATFORM_BRAND);

  constructor() {
    // Atribución de la demo: utm_* y dominio del referer de la primera llegada (solo en el navegador).
    afterNextRender(() => {
      captureAttribution(window.location.search, document.referrer, window.location.hostname, sessionStore());
      // Link de referido: se guarda al llegar para que el registro lo use aunque pase por los planes.
      captureReferralLink(window.location.search, sessionStore());
      // Volver atrás desde la pasarela no deja botones trabados ni datos viejos.
      reloadOnBackForwardRestore(window, () => window.location.reload());
    });
  }
}
