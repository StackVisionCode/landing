import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountContinueComponent } from './account-continue.component';

describe('AccountContinueComponent', () => {
  function create(
    ticket: string | null,
    startFromHandoff = vi.fn(() => of('active')),
    returnUrl: string | null = null
  ) {
    const navigate = vi.fn(() => Promise.resolve(true));
    const navigateByUrl = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      imports: [AccountContinueComponent],
      providers: [
        { provide: AccountSessionStore, useValue: { startFromHandoff, status: () => 'unknown' } },
        { provide: Router, useValue: { navigate, navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: (key: string) => (key === 'ticket' ? ticket : returnUrl) } },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AccountContinueComponent);
    fixture.detectChanges();
    return {
      component: fixture.componentInstance,
      page: fixture.nativeElement as HTMLElement,
      startFromHandoff,
      navigate,
      navigateByUrl,
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('canjea el vale y entra al Account sin dejarlo en el historial', () => {
    const { startFromHandoff, navigateByUrl } = create('ticket-1');

    expect(startFromHandoff).toHaveBeenCalledWith('ticket-1');
    expect(navigateByUrl).toHaveBeenCalledWith('/account', { replaceUrl: true });
  });

  // El espacio de trabajo dice a qué venía: "Add seats" aterriza en Seats, no en el resumen.
  it('aterriza en la sección que pidió el espacio de trabajo', () => {
    const { navigateByUrl } = create('ticket-1', vi.fn(() => of('active')), '/account/seats');

    expect(navigateByUrl).toHaveBeenCalledWith('/account/seats', { replaceUrl: true });
  });

  it('ignora un destino que no sea del Account', () => {
    const { navigateByUrl } = create('ticket-1', vi.fn(() => of('active')), 'https://otro.sitio/phish');

    expect(navigateByUrl).toHaveBeenCalledWith('/account', { replaceUrl: true });
  });

  it('con el vale ya usado o vencido explica cómo volver a abrirlo', () => {
    const { component, page } = create('ticket-1', vi.fn(() => throwError(() => new Error('used'))));

    expect(component.failed()).toBe(true);
    expect(page.textContent).toContain(component.t().accContinueFailedTitle);
  });

  it('sin vale en la URL no llama al backend', () => {
    const { component, startFromHandoff } = create(null);

    expect(startFromHandoff).not.toHaveBeenCalled();
    expect(component.failed()).toBe(true);
  });
});
