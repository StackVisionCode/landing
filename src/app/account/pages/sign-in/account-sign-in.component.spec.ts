import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { CentralLoginService } from '@core/auth/central-login.service';
import { DiscoverOutcome } from '@core/auth/central-login.models';
import { AccountSignInComponent } from './account-sign-in.component';

const OFFICES = [
  { tenantId: 't-1', subdomain: 'acme', tenantName: 'Acme Tax', mfaRequired: false, isClientPortal: false },
  { tenantId: 't-2', subdomain: 'globex', tenantName: 'Globex', mfaRequired: true, isClientPortal: false },
];

describe('AccountSignInComponent', () => {
  function create(overrides: {
    discover?: ReturnType<typeof vi.fn>;
    handoff?: ReturnType<typeof vi.fn>;
    startFromLogin?: ReturnType<typeof vi.fn>;
    confirmTakeover?: ReturnType<typeof vi.fn>;
    returnUrl?: string | null;
  } = {}) {
    const central = {
      discover: overrides.discover ?? vi.fn(() => of({ kind: 'ticket', ticket: 'tk-1' } as DiscoverOutcome)),
      handoff: overrides.handoff ?? vi.fn(() => of({ subdomain: 'acme', ticket: 'tk-2' })),
    };
    const session = {
      startFromLogin: overrides.startFromLogin ?? vi.fn(() => of({ kind: 'signed-in' })),
      confirmTakeover: overrides.confirmTakeover ?? vi.fn(() => of({ kind: 'signed-in' })),
    };
    const navigateByUrl = vi.fn(() => Promise.resolve(true));

    TestBed.configureTestingModule({
      imports: [AccountSignInComponent],
      providers: [
        { provide: CentralLoginService, useValue: central },
        { provide: AccountSessionStore, useValue: session },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => overrides.returnUrl ?? null } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(AccountSignInComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.email.set('ada@acme.test');
    component.password.set('secret');
    return { component, fixture, central, session, navigateByUrl };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('con una sola oficina y sin segundo paso entra directo', () => {
    const { component, session, navigateByUrl } = create();

    component.submitCredentials();

    expect(session.startFromLogin).toHaveBeenCalledWith('tk-1');
    expect(navigateByUrl).toHaveBeenCalledWith('/account', { replaceUrl: true });
  });

  it('vuelve a donde iba antes de que le pidieran iniciar sesión', () => {
    const { component, navigateByUrl } = create({ returnUrl: '/account/billing' });

    component.submitCredentials();

    expect(navigateByUrl).toHaveBeenCalledWith('/account/billing', { replaceUrl: true });
  });

  // El destino viene de la URL: un host ajeno convertiría esta pantalla en un redirect abierto.
  it('ignora un destino que no sea del Account', () => {
    const { component, navigateByUrl } = create({ returnUrl: 'https://otro.sitio/phish' });

    component.submitCredentials();

    expect(navigateByUrl).toHaveBeenCalledWith('/account', { replaceUrl: true });
  });

  it('con varias oficinas las ofrece y solo pide el código donde hace falta', () => {
    const { component, fixture } = create({
      discover: vi.fn(() => of({ kind: 'choose', sessionRef: 'ref-1', offices: OFFICES } as DiscoverOutcome)),
    });

    component.submitCredentials();
    fixture.detectChanges();

    expect(component.step()).toBe('office');
    expect(component.chosenTenantId()).toBeNull();
    component.chooseOffice('t-1');
    expect(component.needsCode()).toBe(false);
    component.chooseOffice('t-2');
    expect(component.needsCode()).toBe(true);
  });

  it('manda el código de la oficina que lo pide', () => {
    const { component, central } = create({
      discover: vi.fn(() => of({ kind: 'choose', sessionRef: 'ref-1', offices: OFFICES } as DiscoverOutcome)),
    });

    component.submitCredentials();
    component.chooseOffice('t-2');
    component.mfaCode.set('123456');
    component.submitOffice();

    expect(central.handoff).toHaveBeenCalledWith('ref-1', 't-2', '123456', false);
  });

  // ---- "no volver a pedirme el código" ----

  it('pide marcar el dispositivo solo cuando se marcó la casilla', () => {
    const { component, central } = create({
      discover: vi.fn(() => of({ kind: 'choose', sessionRef: 'ref-1', offices: OFFICES } as DiscoverOutcome)),
    });

    component.submitCredentials();
    component.chooseOffice('t-2');
    component.mfaCode.set('123456');
    component.rememberDevice.set(true);
    component.submitOffice();

    expect(central.handoff).toHaveBeenCalledWith('ref-1', 't-2', '123456', true);
  });

  it('una oficina sin segundo factor nunca manda el pedido', () => {
    // Sin código que resolver no hay nada que saltarse después; mandarlo marcaría un dispositivo que
    // no prueba nada.
    const { component, central } = create({
      discover: vi.fn(() => of({ kind: 'choose', sessionRef: 'ref-1', offices: OFFICES } as DiscoverOutcome)),
    });

    component.submitCredentials();
    component.chooseOffice('t-2');
    component.rememberDevice.set(true);
    component.chooseOffice('t-1');
    component.submitOffice();

    expect(component.rememberDevice()).toBe(false);
    expect(central.handoff).toHaveBeenCalledWith('ref-1', 't-1', null, false);
  });

  // Sesión única: entrar acá cierra la del espacio de trabajo, así que primero se dice.
  it('si ya hay otra sesión abierta pide confirmarla antes de cerrarla', () => {
    const { component, session, navigateByUrl } = create({
      startFromLogin: vi.fn(() => of({ kind: 'takeover-required', ticket: 'tk-takeover', expiresInSeconds: 60 })),
    });

    component.submitCredentials();

    expect(component.step()).toBe('takeover');
    expect(navigateByUrl).not.toHaveBeenCalled();

    component.confirmTakeover();

    expect(session.confirmTakeover).toHaveBeenCalledWith('tk-takeover');
    expect(navigateByUrl).toHaveBeenCalledWith('/account', { replaceUrl: true });
  });

  it('a quien no es administrador se lo dice con sus palabras', () => {
    const { component } = create({
      startFromLogin: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'Auth.AccountAdminOnly' } }))
      ),
    });

    component.submitCredentials();

    expect(component.error()).toBe(component.t().accSignInAdminOnly);
  });

  // Un 429 no es un fallo: se dice cuánto esperar y el botón queda bloqueado esa cuenta.
  it('un 429 bloquea el botón con la espera real', () => {
    const { component } = create({
      discover: vi.fn(() =>
        throwError(
          () => new HttpErrorResponse({ status: 429, error: { code: 'RateLimit.Exceeded', retryAfterSeconds: 45 } })
        )
      ),
    });

    component.submitCredentials();

    expect(component.error()).toBe(component.t().accSignInTooMany);
    expect(component.waiting()).toBe(true);
    expect(component.canSubmitCredentials()).toBe(false);
  });

  it('la contraseña se puede mostrar y se olvida al volver atrás', () => {
    const { component } = create({
      discover: vi.fn(() => of({ kind: 'choose', sessionRef: 'ref-1', offices: OFFICES } as DiscoverOutcome)),
    });

    component.togglePassword();
    expect(component.passwordVisible()).toBe(true);

    component.submitCredentials();
    component.backToCredentials();

    expect(component.step()).toBe('credentials');
    expect(component.password()).toBe('');
    expect(component.passwordVisible()).toBe(false);
  });
});
