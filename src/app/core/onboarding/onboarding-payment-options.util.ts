import type { OnboardingPaymentOption } from './onboarding.models';

export function visibleOnboardingPaymentOptions(options: OnboardingPaymentOption[]): OnboardingPaymentOption[] {
  return options.filter((option) => option.enabled);
}
