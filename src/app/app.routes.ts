import { Routes } from '@angular/router';
import { LandingPageComponent } from '@landing/components/landing-page/landing-page.component';
import { ForgotPasswordComponent } from '@landing/components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from '@landing/components/reset-password/reset-password.component';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, title: 'TaxPro Office' },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Recuperar Contraseña - TaxPro Office' },
  { path: 'reset-password', component: ResetPasswordComponent, title: 'Restablecer Contraseña - TaxPro Office' },
];
