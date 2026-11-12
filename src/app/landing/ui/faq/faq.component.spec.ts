import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PlansService } from '@core/plans/plans.service';
import type { PlanResponse } from '@core/plans/plans.models';
import { FaqComponent } from './faq.component';

const enterprise: PlanResponse = {
  id: 'enterprise-id',
  code: 'enterprise',
  name: 'Enterprise',
  description: '',
  tier: 'Enterprise',
  monthlyPriceUsd: 99,
  supportedBillingCycles: ['Monthly', 'Yearly'],
  pricesUsdByCycle: { Monthly: 99, Yearly: 999 },
  maxUsers: 3,
  maxPendingInvitations: 5,
  storageQuotaBytes: 15 * 1024 ** 3,
  enabledModules: [],
  rank: 3,
  isFeatured: true,
};

describe('FaqComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('la respuesta de precios sale del catálogo, sin precios escritos', () => {
    TestBed.configureTestingModule({
      imports: [FaqComponent],
      providers: [{ provide: PlansService, useValue: { getPlans: () => of([enterprise]) } }],
    });
    const fixture = TestBed.createComponent(FaqComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as { toggle(i: number): void };
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('#faq h3 button');
    component.toggle(items.length - 1);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('$99');
    expect(text).toContain('$999');
    expect(text).not.toContain('$49');
    expect(text).not.toContain('$299');
  });
});
