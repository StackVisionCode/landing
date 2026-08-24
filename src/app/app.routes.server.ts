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
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
