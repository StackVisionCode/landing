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

  // Una contraseña equivocada no cierra la sesión: solo se explica y se puede reintentar.
  it('una contraseña equivocada se explica y no avisa como confirmada', () => {
    const rejected = new HttpErrorResponse({ status: 400, error: { code: 'Auth.InvalidCredentials' } });
    const { component } = create({ elevate: vi.fn(() => throwError(() => rejected)) });
    let confirmed = 0;
    component.confirmed.subscribe(() => confirmed++);
    component.password.set('nope');

    component.submit();

    expect(component.error()).toBe("That password doesn't match. Try again.");
    expect(confirmed).toBe(0);
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
