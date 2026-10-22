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
    // Solo el home se pre-renderiza (index.html). Con '**' en Prerender el build volcaba el home en
    // index.html y nginx lo servía para cualquier ruta: al entrar al Account desde el CRM se veía el
    // home antes de redirigir. Las rutas desconocidas van al shell vacío y muestran la 404 del cliente.
    path: '',
    renderMode: RenderMode.Prerender
  },
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
