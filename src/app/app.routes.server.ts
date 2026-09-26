import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Lee ?plan=&cycle=&referral= reales de la navegación: prerenderizarla horneraría un estado vacío
    // y produciría un mismatch de hidratación frente al estado real.
    path: 'register',
    renderMode: RenderMode.Client
  },
  {
    // Lee ?token=RegistrationToken real del link del correo de registro.
    path: 'register/complete',
    renderMode: RenderMode.Client
  },
  {
    // Retorno de Stripe: lee ?r= real y reconcilia en runtime — prerenderizarla horneraría
    // un estado vacío. Mismo motivo que register/register-complete.
    path: 'register/payment-received',
    renderMode: RenderMode.Client
  },
  {
    // Páginas legales: el HTML del documento se baja del backend en runtime — prerenderizarlas
    // horneraría el estado de carga vacío. Cliente, mismo motivo que las rutas de onboarding.
    path: 'terms',
    renderMode: RenderMode.Client
  },
  {
    path: 'privacy',
    renderMode: RenderMode.Client
  },
  {
    // Account: todo depende de la sesión del navegador (cookie + token en memoria). Prerenderizarlo
    // hornearía la pantalla de "sin sesión" para todos.
    path: 'account/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'account',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
