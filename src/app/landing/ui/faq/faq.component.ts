import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';
import { BookingModalComponent } from '@shared/ui/booking-modal/booking-modal.component';

@Component({
  selector: 'app-faq',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [BookingModalComponent],
  templateUrl: './faq.component.html',
})
export class FaqComponent {
  protected readonly t = inject(TranslationStore).t;
  protected readonly bookingId = SITE_CONFIG.booking.faq;
  protected readonly showBooking = signal(false);
  protected readonly openIndex = signal<number | null>(0);

  protected readonly items = computed(() => [
    { question: this.t().faqQuestion1, answer: this.t().faqAnswer1 },
    { question: this.t().faqQuestion2, answer: this.t().faqAnswer2 },
    { question: this.t().faqQuestion3, answer: this.t().faqAnswer3 },
    { question: this.t().faqQuestion4, answer: this.t().faqAnswer4 },
  ]);

  toggle(index: number): void {
    this.openIndex.set(this.openIndex() === index ? null : index);
  }
}
