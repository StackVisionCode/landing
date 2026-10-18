import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';

export type SeatSlotGatingMode = 'Disabled' | 'Shadow' | 'Enforce';

export interface AccountSeatSlot {
  userId: string;
  fullName: string;
  email: string;
  isOwner: boolean;
  slotIndex: number;
  slotPriorityAt: string | null;
  isGated: boolean;
}

export interface AccountSeatSlotReport {
  effectiveCap: number;
  mode: SeatSlotGatingMode;
  slots: AccountSeatSlot[];
}

export interface OverrideSeatSlotPriorityRequest {
  slotPriorityAt: string | null;
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class AccountSeatSlotService {
  private readonly http = inject(HttpClient);
  private readonly base = SITE_CONFIG.apiUrl;

  getSlots(): Observable<AccountSeatSlotReport> {
    return this.http.get<AccountSeatSlotReport>(`${this.base}/auth/admin/tenants/me/seat-slots`);
  }

  overrideSlotPriority(userId: string, request: OverrideSeatSlotPriorityRequest): Observable<void> {
    return this.http.patch<void>(`${this.base}/auth/admin/users/${userId}/slot-priority`, request);
  }

  /** @deprecated use {@link overrideSlotPriority}; kept as alias for existing callers. */
  overridePriority(userId: string, request: OverrideSeatSlotPriorityRequest): Observable<void> {
    return this.overrideSlotPriority(userId, request);
  }
}
