import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Lee email/token de la query string real del navegador (link del correo);
    // prerenderizarla horneraría un estado vacío y produciría un mismatch de
    // hidratación frente al estado real post-hidratación.
    path: 'reset-password',
    renderMode: RenderMode.Client
  },
  {
    // Lee ?plan=&cycle= reales de la navegación desde /precios — mismo motivo
    // que reset-password, el estado inicial depende de query params en runtime.
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
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
