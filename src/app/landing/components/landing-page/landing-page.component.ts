import { Component } from '@angular/core';
import { NavbarComponent } from '@landing/ui/navbar/navbar.component';
import { HeroComponent } from '@landing/ui/hero/hero.component';
import { FeaturesGridComponent } from '@landing/ui/features-grid/features-grid.component';
import { ProductsComponent } from '@landing/ui/products/products.component';
import { HowItWorksComponent } from '@landing/ui/how-it-works/how-it-works.component';
import { SponsorsComponent } from '@landing/ui/sponsors/sponsors.component';
import { PricingComponent } from '@landing/ui/pricing/pricing.component';
import { FaqComponent } from '@landing/ui/faq/faq.component';
import { CtaComponent } from '@landing/ui/cta/cta.component';
import { FooterComponent } from '@landing/ui/footer/footer.component';

@Component({
  selector: 'app-landing-page',
  imports: [
    NavbarComponent,
    HeroComponent,
    FeaturesGridComponent,
    ProductsComponent,
    HowItWorksComponent,
    SponsorsComponent,
    PricingComponent,
    FaqComponent,
    CtaComponent,
    FooterComponent,
  ],
  templateUrl: './landing-page.component.html',
})
export class LandingPageComponent {}
