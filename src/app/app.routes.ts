import { Routes } from '@angular/router';
import { LandingPageComponent } from '@landing/components/landing-page/landing-page.component';
import { ForgotPasswordComponent } from '@landing/components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from '@landing/components/reset-password/reset-password.component';
import { RegisterComponent } from '@landing/components/register/register.component';
import { RegisterPaymentReceivedComponent } from '@landing/components/register-payment-received/register-payment-received.component';
import { RegisterCompleteComponent } from '@landing/components/register-complete/register-complete.component';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, title: 'TaxPro Office' },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Recuperar Contraseña - TaxPro Office' },
  { path: 'reset-password', component: ResetPasswordComponent, title: 'Restablecer Contraseña - TaxPro Office' },
  { path: 'register', component: RegisterComponent, title: 'Crear cuenta - TaxPro Office' },
  {
    path: 'register/payment-received',
    component: RegisterPaymentReceivedComponent,
    title: 'Pago recibido - TaxPro Office',
  },
  { path: 'register/complete', component: RegisterCompleteComponent, title: 'Completa tu registro - TaxPro Office' },
];
