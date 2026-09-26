import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { accountGuard } from './account.guard';
import { AccountSessionStore } from './account-session.store';

describe('accountGuard', () => {
  function run(status: string, isAdmin = true, url = '/account'): boolean | UrlTree {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AccountSessionStore,
          useValue: { restore: () => of(status), isAccountAdmin: () => isAdmin },
        },
      ],
    });
    let result: boolean | UrlTree = false;
    TestBed.runInInjectionContext(() => {
      (
        accountGuard(null as never, { url } as never) as {
          subscribe: (fn: (v: boolean | UrlTree) => void) => void;
        }
      ).subscribe(
        value => (result = value)
      );
    });
    return result;
  }

  function path(result: boolean | UrlTree): string {
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('deja pasar al administrador de la oficina', () => {
    expect(run('active')).toBe(true);
  });

  // Aceptación de la fase: un empleado o un cliente que entra por URL ve "No access".
  it('manda a "No access" a quien no es administrador', () => {
    expect(path(run('active', false))).toBe('/account/no-access');
  });

  it('sin sesión manda a iniciar sesión', () => {
    expect(path(run('anonymous'))).toBe('/account/sign-in');
  });

  // Entrar por un enlace profundo y terminar en el resumen sería perder el sitio al que iba.
  it('guarda a dónde iba para volver ahí después de iniciar sesión', () => {
    expect(path(run('anonymous', true, '/account/billing'))).toBe(
      '/account/sign-in?returnUrl=%2Faccount%2Fbilling'
    );
  });

  it('con la sesión terminada lo dice en vez de mandar al inicio', () => {
    expect(path(run('revoked'))).toBe('/account/session-ended');
  });
});
