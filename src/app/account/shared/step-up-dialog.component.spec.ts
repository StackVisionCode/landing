import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { StepUpDialogComponent } from './step-up-dialog.component';

describe('StepUpDialogComponent', () => {
  function create(overrides: object = {}) {
    const session = { elevate: vi.fn(() => of(void 0)), ...overrides };
    TestBed.configureTestingModule({
      imports: [StepUpDialogComponent],
      providers: [{ provide: AccountSessionStore, useValue: session }],
    });
    const fixture = TestBed.createComponent(StepUpDialogComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, session };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sin contraseña no llama al backend', () => {
    const { component, session } = create();

    component.submit();

    expect(session.elevate).not.toHaveBeenCalled();
  });

  it('confirmar eleva la sesión y avisa a la pantalla', () => {
    const { component, session } = create();
    let confirmed = 0;
    component.confirmed.subscribe(() => confirmed++);
    component.password.set('s3cret');
    component.code.set('123456');

    component.submit();

    expect(session.elevate).toHaveBeenCalledWith({ password: 's3cret', code: '123456' });
    expect(confirmed).toBe(1);
  });

  /**
   * Los códigos son los que emite `ReauthenticateHandler`, verificados en el backend. El test
   * anterior usaba `Auth.InvalidCredentials`, que **no existe**: pasaba en verde mientras el
   * diálogo mostraba el mensaje genérico para TODOS los fallos. Un test que fija un contrato
   * inventado no prueba nada.
   */
  function rechazoCon(code: string) {
    const rejected = new HttpErrorResponse({ status: 400, error: { code } });
    const { component } = create({ elevate: vi.fn(() => throwError(() => rejected)) });
    component.password.set('algo');
    component.submit();
    return component;
  }

  // Una contraseña equivocada no cierra la sesión: solo se explica y se puede reintentar.
  it('una contraseña equivocada se explica y no avisa como confirmada', () => {
    const rejected = new HttpErrorResponse({ status: 400, error: { code: 'Auth.ReauthenticationFailed' } });
    const { component } = create({ elevate: vi.fn(() => throwError(() => rejected)) });
    let confirmed = 0;
    component.confirmed.subscribe(() => confirmed++);
    component.password.set('nope');

    component.submit();

    // El backend usa el MISMO error para contraseña y código malos, para no filtrar cuál falló.
    expect(component.error()).toBe("That password or code isn't right. Try again.");
    expect(confirmed).toBe(0);
  });

  it('si falta el código del autenticador, lo PIDE en vez de culpar a la contraseña', () => {
    // Éste era el caso que dejaba al usuario reintentando la contraseña para siempre.
    expect(rechazoCon('Auth.MfaCodeRequired').error()).toBe('Enter the code from your authenticator app.');
  });

  it('la cuenta bloqueada se explica como tal', () => {
    expect(rechazoCon('Auth.LockedOut').error()).toBe('Too many attempts. Try again later.');
  });

  it('una sesión muerta se dice, no se disfraza de contraseña mala', () => {
    expect(rechazoCon('Auth.SessionRevoked').error()).toBe('Your session ended. Sign in again to continue.');
  });

  it('un código desconocido cae al mensaje genérico', () => {
    expect(rechazoCon('Vaya.CosaRara').error()).toBe("We couldn't confirm it. Please try again.");
  });

  it('cancelar limpia lo escrito', () => {
    const { component } = create();
    component.password.set('s3cret');
    let dismissed = 0;
    component.dismissed.subscribe(() => dismissed++);

    component.dismiss();

    expect(component.password()).toBe('');
    expect(dismissed).toBe(1);
  });
});
