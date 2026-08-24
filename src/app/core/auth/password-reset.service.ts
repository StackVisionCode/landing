import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import {
  ApiResponse,
  PasswordResetResult,
  ResetPasswordData,
  SendOtpData,
  ValidateOtpData,
} from './auth.models';

/**
 * Recuperación de contraseña del landing (portado de LandingPageTaxProSuite):
 * 1) requestReset envía el correo con el link email+token;
 * 2) ese link dispara sendOtp automáticamente (código de 8 dígitos al correo);
 * 3) validateOtp confirma el código;
 * 4) resetPassword aplica la nueva contraseña.
 */
@Injectable({ providedIn: 'root' })
export class PasswordResetService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = SITE_CONFIG.apiUrl;

  requestReset(email: string): Observable<PasswordResetResult> {
    return this.post(`${this.apiUrl}/landing/reset/request`, { email });
  }

  sendOtp(data: SendOtpData): Observable<PasswordResetResult> {
    return this.post(`${this.apiUrl}/landing/reset/otp/send`, data);
  }

  validateOtp(data: ValidateOtpData): Observable<PasswordResetResult> {
    return this.post(`${this.apiUrl}/landing/reset/otp/validate`, data);
  }

  resetPassword(data: ResetPasswordData): Observable<PasswordResetResult> {
    return this.post(`${this.apiUrl}/landing/reset/reset`, data);
  }

  private post(url: string, body: unknown): Observable<PasswordResetResult> {
    return this.http.post<ApiResponse<unknown>>(url, body).pipe(
      map((response): PasswordResetResult => {
        if (response.success) {
          return { success: true };
        }
        throw new Error(response.message || 'Request failed');
      }),
      catchError((error) => of<PasswordResetResult>({ success: false, error: this.extractErrorMessage(error) })),
    );
  }

  private extractErrorMessage(error: unknown): string {
    const err = error as { error?: { message?: string }; message?: string };
    if (err?.error?.message) {
      return err.error.message;
    }
    if (err?.message) {
      return err.message;
    }
    return 'An unexpected error has occurred';
  }
}
