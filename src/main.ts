import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElements as defineIonicons } from 'ionicons/loader';
import { apiBaseFor, loadPlatformRuntime } from './app/core/config/platform-runtime';

// ionicons autohospedado: el loader se bundlea con la app (sin <script> en
// index.html, que vite intentaba pre-transformar y fallaba) y los SVG se
// sirven desde /ionicons/ (copiados vía angular.json assets).
defineIonicons(window, { resourcesUrl: '/ionicons/' });

// Marca y razón social vigentes (PlatformSettings) ANTES de cargar la app: site-config y los textos que
// las usan se evalúan recién en el import dinámico de abajo. El HTML prerenderizado ya está pintado; esto
// solo demora la hidratación, y como mucho 2 s si la API no contesta.
await loadPlatformRuntime(apiBaseFor(window.location.hostname));
const [{ appConfig }, { App }] = await Promise.all([import('./app/app.config'), import('./app/app')]);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
