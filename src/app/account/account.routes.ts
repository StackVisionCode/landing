import { Routes } from '@angular/router';
import { accountGuard } from '@core/auth/account.guard';
import { accountTermsGuard } from '@core/auth/account-terms.guard';
import { PLATFORM_BRAND } from '@core/config/site-config';

/**
 * Account (Manage subscription). El inicio de sesión y las pantallas de aviso quedan FUERA del guard: son
 * justo a donde el guard manda cuando no hay sesión, no es de administrador o la sesión terminó.
 */
export const ACCOUNT_ROUTES: Routes = [
  {
    path: 'continue',
    loadComponent: () =>
      import('./pages/continue/account-continue.component').then(m => m.AccountContinueComponent),
    title: `Account - ${PLATFORM_BRAND}`,
  },
  {
    path: 'sign-in',
    loadComponent: () =>
      import('./pages/sign-in/account-sign-in.component').then(m => m.AccountSignInComponent),
    title: `Sign in - ${PLATFORM_BRAND}`,
  },
  {
    path: 'no-access',
    loadComponent: () => import('./pages/notice/account-notice.component').then(m => m.AccountNoticeComponent),
    data: { kind: 'no-access' },
    title: `Account - ${PLATFORM_BRAND}`,
  },
  {
    path: 'session-ended',
    loadComponent: () => import('./pages/notice/account-notice.component').then(m => m.AccountNoticeComponent),
    data: { kind: 'session-ended' },
    title: `Account - ${PLATFORM_BRAND}`,
  },
  {
    // Gate de ToS: cuando el middleware del backend rechaza con 409 Terms.NotAccepted, el usuario
    // llega acá (via accountTermsGuard de las rutas protegidas) y puede aceptar sin salir del landing.
    path: 'accept-terms',
    canActivate: [accountGuard],
    loadComponent: () =>
      import('./pages/accept-terms/account-accept-terms.component').then(m => m.AccountAcceptTermsComponent),
    title: `Accept terms - ${PLATFORM_BRAND}`,
  },
  {
    path: '',
    canActivate: [accountGuard, accountTermsGuard],
    loadComponent: () =>
      import('./account-shell/account-shell.component').then(m => m.AccountShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/overview/account-overview.component').then(m => m.AccountOverviewComponent),
        title: `Subscription - ${PLATFORM_BRAND}`,
      },
      {
        path: 'plan',
        loadComponent: () => import('./pages/plan/account-plan.component').then(m => m.AccountPlanComponent),
        title: `Plan - ${PLATFORM_BRAND}`,
      },
      {
        path: 'seats',
        loadComponent: () => import('./pages/seats/account-seats.component').then(m => m.AccountSeatsComponent),
        title: `Seats - ${PLATFORM_BRAND}`,
      },
      {
        path: 'add-ons',
        loadComponent: () => import('./pages/addons/account-addons.component').then(m => m.AccountAddOnsComponent),
        title: `Add-ons - ${PLATFORM_BRAND}`,
      },
      {
        path: 'billing',
        loadComponent: () =>
          import('./pages/billing/account-billing.component').then(m => m.AccountBillingComponent),
        title: `Billing history - ${PLATFORM_BRAND}`,
      },
      {
        path: 'office',
        loadComponent: () =>
          import('./pages/office/account-office.component').then(m => m.AccountOfficeComponent),
        title: `Office & account - ${PLATFORM_BRAND}`,
      },
    ],
  },
];
