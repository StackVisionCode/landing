import { visibleOnboardingPaymentOptions } from './onboarding-payment-options.util';
import type { OnboardingPaymentOption } from './onboarding.models';

describe('onboarding payment options', () => {
  const options: OnboardingPaymentOption[] = [
    {
      provider: 'Stripe',
      method: 'Card',
      displayName: 'Card',
      enabled: true,
      priority: 10,
      disabledReason: null,
    },
    {
      provider: 'PayPal',
      method: 'Wallet',
      displayName: 'PayPal',
      enabled: false,
      priority: 20,
      disabledReason: 'ProviderNotConfigured',
    },
  ];

  it('keeps only enabled options visible to onboarding', () => {
    expect(visibleOnboardingPaymentOptions(options)).toEqual([options[0]]);
  });
});
