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
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
