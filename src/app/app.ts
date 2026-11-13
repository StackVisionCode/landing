import { Component, afterNextRender, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PLATFORM_BRAND } from '@core/config/site-config';
import { captureAttribution, sessionStore } from '@core/public-booking/attribution';

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
    afterNextRender(() =>
      captureAttribution(window.location.search, document.referrer, window.location.hostname, sessionStore()),
    );
  }
}
