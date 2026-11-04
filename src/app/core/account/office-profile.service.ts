import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';

/** Dirección del perfil de la oficina (Tenant). Todo opcional: el onboarding no la pide. */
export interface OfficeProfileAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

/**
 * `GET /tenants/current/profile` — solo lo que usa el Account (datos de facturación). El endpoint
 * devuelve más (horario, enlaces, idioma); acá no se muestran.
 */
export interface OfficeProfile {
  legalName: string | null;
  ein: string | null;
  physicalAddress: OfficeProfileAddress | null;
  mailingSameAsPhysical: boolean;
  mailingAddress: OfficeProfileAddress | null;
}

/** Perfil de la oficina del tenant de la sesión. Sin perfil guardado responde vacío, nunca 404. */
@Injectable({ providedIn: 'root' })
export class OfficeProfileService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;

  get(): Observable<OfficeProfile> {
    return this.http.get<OfficeProfile>(`${this.base}/tenants/current/profile`);
  }
}
