import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { accountAuthInterceptor } from '@core/auth/account-auth.interceptor';
import { provideRouter, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Fundido entre pantallas (p. ej. /account/continue -> Account). El primer pintado no se anima.
    provideRouter(routes, withViewTransitions({ skipInitialTransition: true })),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptors([accountAuthInterceptor]))
  ]
};
