import { Component } from '@angular/core';
import { NavbarComponent } from '@landing/ui/navbar/navbar.component';
import { HeroComponent } from '@landing/ui/hero/hero.component';
import { FeaturesGridComponent } from '@landing/ui/features-grid/features-grid.component';
import { BenefitsComponent } from '@landing/ui/benefits/benefits.component';
import { HowItWorksComponent } from '@landing/ui/how-it-works/how-it-works.component';
import { TeamPhotoComponent } from '@landing/ui/team-photo/team-photo.component';
import { PricingComponent } from '@landing/ui/pricing/pricing.component';
import { FaqComponent } from '@landing/ui/faq/faq.component';
import { NewsletterComponent } from '@landing/ui/newsletter/newsletter.component';
import { CtaComponent } from '@landing/ui/cta/cta.component';

@Component({
  selector: 'app-landing-page',
  imports: [
    NavbarComponent,
    HeroComponent,
    FeaturesGridComponent,
    BenefitsComponent,
    HowItWorksComponent,
    TeamPhotoComponent,
    PricingComponent,
    FaqComponent,
    NewsletterComponent,
    CtaComponent,
  ],
  templateUrl: './landing-page.component.html',
})
export class LandingPageComponent {}
