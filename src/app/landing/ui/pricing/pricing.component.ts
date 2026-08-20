import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';
import type { PricingTierCopy } from '@core/i18n/translation.model';

interface PricingTier {
  copy: PricingTierCopy;
  monthlyPrice: number;
  annualPrice: number;
  highlighted: boolean;
  ctaKey: 'startForFree' | 'reserveNow';
}

@Component({
  selector: 'app-pricing',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './pricing.component.html',
})
export class PricingComponent {
  protected readonly t = inject(TranslationStore).t;
  protected readonly siteConfig = SITE_CONFIG;
  protected readonly isAnnual = signal(false);

  protected readonly tiers = computed<PricingTier[]>(() => [
    { copy: this.t().planFree, monthlyPrice: 0, annualPrice: 0, highlighted: false, ctaKey: 'startForFree' },
    { copy: this.t().planStandard, monthlyPrice: 97, annualPrice: 699, highlighted: false, ctaKey: 'reserveNow' },
    { copy: this.t().planPro, monthlyPrice: 149, annualPrice: 899, highlighted: true, ctaKey: 'reserveNow' },
  ]);

  priceFor(tier: PricingTier): number {
    if (tier.monthlyPrice === 0) return 0;
    return this.isAnnual() ? tier.annualPrice : tier.monthlyPrice;
  }
}
