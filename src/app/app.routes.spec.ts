import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RenderMode } from '@angular/ssr';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';

/**
 * Guardas del paso CRM -> Account y de las URLs mal escritas. Si alguna se rompe vuelve a verse el home
 * antes del Account (producción) o una página en blanco.
 */
describe('Rutas del landing', () => {
  it('la última ruta es la comodín y lleva a la 404', () => {
    const last = routes[routes.length - 1];

    expect(last.path).toBe('**');
    expect(last.loadComponent).toBeDefined();
  });

  it('solo el home se pre-renderiza; lo desconocido y el Account son del cliente', () => {
    const mode = (path: string) => serverRoutes.find(route => route.path === path)?.renderMode;

    expect(mode('')).toBe(RenderMode.Prerender);
    expect(mode('**')).toBe(RenderMode.Client);
    expect(mode('account')).toBe(RenderMode.Client);
    expect(mode('account/**')).toBe(RenderMode.Client);
  });

  it('nginx cae al shell vacío, no al home pre-renderizado', () => {
    const conf = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

    expect(conf).toMatch(/location \/ \{\s*try_files \$uri \$uri\/index\.html \/index\.csr\.html;/);
    expect(conf).not.toMatch(/try_files[^;]*\s\/index\.html;/);
  });
});
