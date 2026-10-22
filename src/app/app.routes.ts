import { Routes } from '@angular/router';
import { LandingPageComponent } from '@landing/components/landing-page/landing-page.component';
import { RegisterComponent } from '@landing/components/register/register.component';
import { RegisterPaymentReceivedComponent } from '@landing/components/register-payment-received/register-payment-received.component';
import { RegisterCompleteComponent } from '@landing/components/register-complete/register-complete.component';
import { LegalPageComponent } from '@landing/components/legal/legal-page.component';
import { PLATFORM_BRAND } from '@core/config/site-config';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, title: PLATFORM_BRAND },
  { path: 'register', component: RegisterComponent, title: `Crear cuenta - ${PLATFORM_BRAND}` },
  {
    path: 'register/payment-received',
    component: RegisterPaymentReceivedComponent,
    title: `Pago recibido - ${PLATFORM_BRAND}`,
  },
  { path: 'register/complete', component: RegisterCompleteComponent, title: `Completa tu registro - ${PLATFORM_BRAND}` },
  {
    // Account (Manage subscription): área autenticada, se carga solo cuando se entra.
    path: 'account',
    loadChildren: () => import('@account/account.routes').then(m => m.ACCOUNT_ROUTES),
  },
  {
    path: 'terms',
    component: LegalPageComponent,
    data: { kind: 'TermsOfService' },
    title: `Terms of Service - ${PLATFORM_BRAND}`,
  },
  {
    path: 'privacy',
    component: LegalPageComponent,
    data: { kind: 'PrivacyPolicy' },
    title: `Privacy Policy - ${PLATFORM_BRAND}`,
  },
  {
    // Siempre la última: sin ella una URL mal escrita dejaba la página en blanco.
    path: '**',
    loadComponent: () =>
      import('@landing/components/not-found/not-found.component').then(m => m.NotFoundComponent),
    title: `Page not found - ${PLATFORM_BRAND}`,
  },
];
