export type Lang = 'es' | 'en';

export interface PricingTierCopy {
  name: string;
  description: string;
  features: string[];
}

export interface TranslationKeys {
  // Navbar
  navFeatures: string;
  navProducts: string;
  navPricing: string;
  navFaq: string;
  navSignIn: string;
  navGoToApp: string;

  // Hero
  heroTitle: string;
  heroDescription: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;

  // Features
  featuresBadge: string;
  featuresMainTitleHtml: string;
  featuresSubtitle: string;
  featureDashboardTitle: string;
  featureDashboardDescription: string;
  featureClientMgmtTitle: string;
  featureClientPortalTitle: string;
  featureClientPortalDescription: string;
  featureChatTitle: string;
  featureSignaturesTitle: string;
  featureSignaturesCaption: string;
  featureBillingTitle: string;
  featureBillingDescription: string;

  // Products
  productsTitleHtml: string;
  productsSubtitle: string;
  webPortalTitle: string;
  webPortalDescription: string;

  // How it works
  howItWorksBadge: string;
  howItWorksTitleHtml: string;
  step1Title: string;
  step1Description: string;
  step2Title: string;
  step2Description: string;
  step3Title: string;
  step3Description: string;

  // Pricing
  pricingBadge: string;
  pricingTitle: string;
  monthlyLabel: string;
  annualLabel: string;
  mostPopularLabel: string;
  startForFree: string;
  reserveNow: string;
  planFree: PricingTierCopy;
  planStandard: PricingTierCopy;
  planPro: PricingTierCopy;

  // FAQ
  faqSidebarTitleHtml: string;
  helpCenterButton: string;
  faqQuestion1: string;
  faqAnswer1: string;
  faqQuestion2: string;
  faqAnswer2: string;
  faqQuestion3: string;
  faqAnswer3: string;
  faqQuestion4: string;
  faqAnswer4: string;

  // CTA
  ctaMainTitleHtml: string;
  ctaMainSubtitle: string;
  startNowButton: string;
  scheduleDemoButton: string;

  // Footer
  footerTagline: string;
  footerNavigation: string;
  footerStayUpdated: string;
  footerNewsletterSubtitle: string;
  footerNewsletterPlaceholder: string;
  footerNewsletterButton: string;
  footerPrivacyPolicy: string;
  footerTermsOfService: string;
  footerAllRightsReserved: string;

  // Auth modal
  authSignInTab: string;
  authSignUpTab: string;
  authWelcomeBackTitle: string;
  authWelcomeBackSubtitle: string;
  authEmailLabel: string;
  authEmailPlaceholder: string;
  authPasswordLabel: string;
  authPasswordPlaceholder: string;
  authRememberMe: string;
  authForgotPassword: string;
  authSignInButton: string;
  authCreateAccountTitle: string;
  authCreateAccountSubtitle: string;
  authFirstNameLabel: string;
  authFirstNamePlaceholder: string;
  authLastNameLabel: string;
  authLastNamePlaceholder: string;
  authCompanyNameLabel: string;
  authCompanyNamePlaceholder: string;
  authPhoneLabel: string;
  authConfirmPasswordLabel: string;
  authConfirmPasswordPlaceholder: string;
  authAgreeTermsPrefix: string;
  authTermsLink: string;
  authAgreeTermsAnd: string;
  authPrivacyLink: string;
  authCreateAccountButton: string;
  authErrorRequiredFields: string;
  authErrorInvalidEmail: string;
  authErrorPasswordMismatch: string;
  authErrorPasswordLength: string;
  authErrorPhoneDigits: string;
  authErrorTermsRequired: string;
}
