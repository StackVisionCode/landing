import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PLATFORM_BRAND } from '@core/config/site-config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal(PLATFORM_BRAND);
}
