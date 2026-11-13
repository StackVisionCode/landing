import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import type {
  PublicBookingConfirmation,
  PublicBookingCreateRequest,
  PublicBookingManageView,
  PublicBookingPage,
  PublicBookingRequestAccepted,
  PublicBookingRescheduled,
  PublicBookingSlotsResponse,
} from './public-booking.models';

/**
 * Reserva pública de demos (Calendar). Sin sesión: los secretos (manejo de la solicitud y token de gestión)
 * viajan en el cuerpo, nunca en la URL.
 */
@Injectable({ providedIn: 'root' })
export class PublicBookingApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${SITE_CONFIG.apiUrl}/calendar/public`;

  page(slug: string, lang: 'en' | 'es'): Observable<PublicBookingPage> {
    return this.http.get<PublicBookingPage>(
      `${this.base}/booking-pages/${encodeURIComponent(slug)}`,
      {
        params: new HttpParams().set('lang', lang),
      },
    );
  }

  slots(slug: string, fromUtc: Date, toUtc: Date): Observable<PublicBookingSlotsResponse> {
    return this.http.get<PublicBookingSlotsResponse>(
      `${this.base}/booking-pages/${encodeURIComponent(slug)}/slots`,
      {
        params: new HttpParams().set('from', fromUtc.toISOString()).set('to', toUtc.toISOString()),
      },
    );
  }

  request(
    slug: string,
    body: PublicBookingCreateRequest,
    idempotencyKey: string,
  ): Observable<PublicBookingRequestAccepted> {
    return this.http.post<PublicBookingRequestAccepted>(
      `${this.base}/booking-pages/${encodeURIComponent(slug)}/bookings`,
      body,
      { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) },
    );
  }

  verify(requestHandle: string, code: string): Observable<PublicBookingConfirmation> {
    return this.http.post<PublicBookingConfirmation>(`${this.base}/bookings/verify`, {
      requestHandle,
      code,
    });
  }

  chooseSlot(requestHandle: string, slotStartUtc: string): Observable<unknown> {
    return this.http.post(`${this.base}/bookings/choose-slot`, { requestHandle, slotStartUtc });
  }

  resend(requestHandle: string): Observable<unknown> {
    return this.http.post(`${this.base}/bookings/resend`, { requestHandle });
  }

  view(token: string): Observable<PublicBookingManageView> {
    return this.http.post<PublicBookingManageView>(`${this.base}/bookings/manage/view`, { token });
  }

  reschedule(token: string, slotStartUtc: string): Observable<PublicBookingRescheduled> {
    return this.http.post<PublicBookingRescheduled>(`${this.base}/bookings/manage/reschedule`, {
      token,
      slotStartUtc,
    });
  }

  cancel(token: string, reason: string | null): Observable<unknown> {
    return this.http.post(`${this.base}/bookings/manage/cancel`, { token, reason });
  }
}
