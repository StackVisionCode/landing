import { Component, inject } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { DemoBookingService } from '@landing/demo-booking.service';

@Component({
  selector: 'app-team-photo',
  templateUrl: './team-photo.component.html',
})
export class TeamPhotoComponent {
  protected readonly t = inject(TranslationStore).c;
  protected readonly booking = inject(DemoBookingService);
}
