import { Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ModalComponent } from '../modal/modal.component';

/** Wrapper del widget de reservas de LeadConnector sobre el modal genérico. */
@Component({
  selector: 'app-booking-modal',
  imports: [ModalComponent],
  templateUrl: './booking-modal.component.html',
})
export class BookingModalComponent implements OnChanges {
  @Input({ required: true }) bookingId!: string;
  @Input() isOpen = false;
  @Input() heading = 'Agenda una demo';
  @Output() closed = new EventEmitter<void>();

  private readonly sanitizer = inject(DomSanitizer);
  calendarUrl: SafeResourceUrl | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['bookingId'] && this.bookingId) {
      const url = `https://api.leadconnectorhq.com/widget/bookings/${this.bookingId}?embed=true`;
      this.calendarUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
  }

  onClosed(): void {
    this.closed.emit();
  }
}
