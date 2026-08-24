import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import { PlanResponse } from './plans.models';

/** Catálogo público de planes para la landing — GET /plans, anónimo. */
@Injectable({ providedIn: 'root' })
export class PlansService {
  private readonly http = inject(HttpClient);

  getPlans(): Observable<PlanResponse[]> {
    return this.http.get<PlanResponse[]>(`${SITE_CONFIG.apiUrl}/plans`);
  }
}
