import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PlansService } from '@core/plans/plans.service';
import type { PlanResponse } from '@core/plans/plans.models';
import { HowItWorksComponent } from './how-it-works.component';

function plan(id: string, rank: number): PlanResponse {
  return {
    id,
    code: id,
    name: id,
    description: '',
    tier: 'Pro',
    monthlyPriceUsd: 99,
    supportedBillingCycles: ['Monthly'],
    pricesUsdByCycle: { Monthly: 99 },
    maxUsers: 3,
    maxPendingInvitations: 5,
    storageQuotaBytes: 0,
    enabledModules: [],
    rank,
    isFeatured: false,
  };
}

describe('HowItWorksComponent', () => {
  function ctaHref(plans: PlanResponse[]): string {
    TestBed.configureTestingModule({
      imports: [HowItWorksComponent],
      providers: [
        provideRouter([]),
        { provide: PlansService, useValue: { getPlans: () => of(plans) } },
      ],
    });
    const fixture = TestBed.createComponent(HowItWorksComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement)
      .querySelector('[data-create-office]')!
      .getAttribute('href')!;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('con un solo plan a la venta va directo al registro con ese plan', () => {
    expect(ctaHref([plan('ent-id', 3)])).toBe('/register?plan=ent-id&cycle=Monthly');
  });

  it('con varios planes lleva a elegir en la sección de precios', () => {
    expect(ctaHref([plan('a', 1), plan('b', 2)])).toBe('#pricing');
  });
});
