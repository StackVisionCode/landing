import { Routes } from '@angular/router';
import { accountGuard } from '@core/auth/account.guard';

/**
 * Account (Manage subscription). El inicio de sesión y las pantallas de aviso quedan FUERA del guard: son
 * justo a donde el guard manda cuando no hay sesión, no es de administrador o la sesión terminó.
 */
export const ACCOUNT_ROUTES: Routes = [
  {
    path: 'continue',
    loadComponent: () =>
      import('./pages/continue/account-continue.component').then(m => m.AccountContinueComponent),
    title: 'Account - TaxPro Office',
  },
  {
    path: 'sign-in',
    loadComponent: () =>
      import('./pages/sign-in/account-sign-in.component').then(m => m.AccountSignInComponent),
    title: 'Sign in - TaxPro Office',
  },
  {
    path: 'no-access',
    loadComponent: () => import('./pages/notice/account-notice.component').then(m => m.AccountNoticeComponent),
    data: { kind: 'no-access' },
    title: 'Account - TaxPro Office',
  },
  {
    path: 'session-ended',
    loadComponent: () => import('./pages/notice/account-notice.component').then(m => m.AccountNoticeComponent),
    data: { kind: 'session-ended' },
    title: 'Account - TaxPro Office',
  },
  {
    path: '',
    canActivate: [accountGuard],
    loadComponent: () =>
      import('./account-shell/account-shell.component').then(m => m.AccountShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/overview/account-overview.component').then(m => m.AccountOverviewComponent),
        title: 'Subscription - TaxPro Office',
      },
      {
        path: 'plan',
        loadComponent: () => import('./pages/plan/account-plan.component').then(m => m.AccountPlanComponent),
        title: 'Plan - TaxPro Office',
      },
      {
        path: 'seats',
        loadComponent: () => import('./pages/seats/account-seats.component').then(m => m.AccountSeatsComponent),
        title: 'Seats - TaxPro Office',
      },
      {
        path: 'add-ons',
        loadComponent: () => import('./pages/addons/account-addons.component').then(m => m.AccountAddOnsComponent),
        title: 'Add-ons - TaxPro Office',
      },
      {
        path: 'billing',
        loadComponent: () =>
          import('./pages/billing/account-billing.component').then(m => m.AccountBillingComponent),
        title: 'Billing history - TaxPro Office',
      },
      {
        path: 'office',
        loadComponent: () =>
          import('./pages/office/account-office.component').then(m => m.AccountOfficeComponent),
        title: 'Office & account - TaxPro Office',
      },
    ],
  },
];
