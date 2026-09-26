import { Routes } from '@angular/router';
import { LandingPageComponent } from '@landing/components/landing-page/landing-page.component';
import { RegisterComponent } from '@landing/components/register/register.component';
import { RegisterPaymentReceivedComponent } from '@landing/components/register-payment-received/register-payment-received.component';
import { RegisterCompleteComponent } from '@landing/components/register-complete/register-complete.component';
import { LegalPageComponent } from '@landing/components/legal/legal-page.component';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, title: 'TaxPro Office' },
  { path: 'register', component: RegisterComponent, title: 'Crear cuenta - TaxPro Office' },
  {
    path: 'register/payment-received',
    component: RegisterPaymentReceivedComponent,
    title: 'Pago recibido - TaxPro Office',
  },
  { path: 'register/complete', component: RegisterCompleteComponent, title: 'Completa tu registro - TaxPro Office' },
  {
    // Account (Manage subscription): área autenticada, se carga solo cuando se entra.
    path: 'account',
    loadChildren: () => import('@account/account.routes').then(m => m.ACCOUNT_ROUTES),
  },
  {
    path: 'terms',
    component: LegalPageComponent,
    data: { kind: 'TermsOfService' },
    title: 'Terms of Service - TaxPro Office',
  },
  {
    path: 'privacy',
    component: LegalPageComponent,
    data: { kind: 'PrivacyPolicy' },
    title: 'Privacy Policy - TaxPro Office',
  },
];
