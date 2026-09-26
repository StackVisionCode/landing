import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { OfficeBrandingStore } from '@core/account/office-branding.store';
import { AccountShellComponent } from './account-shell.component';

const admin = {
  id: 'u1',
  name: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  actorType: 'TenantAdmin',
  tenant: { id: 't1', name: 'CoreTaxPro', subDomain: 'coretaxpro' },
  roles: [],
  permissions: ['billing.view'],
};

describe('AccountShellComponent', () => {
  function create(logoUrl: string | null = null) {
    const status = signal<string>('active');
    const logout = vi.fn(() => of(void 0));
    const branding = { load: vi.fn(), logoUrl: signal(logoUrl), initials: signal('CO') };
    TestBed.configureTestingModule({
      imports: [AccountShellComponent],
      providers: [
        provideRouter([]),
        { provide: AccountSessionStore, useValue: { me: signal(admin), status, logout } },
        { provide: OfficeBrandingStore, useValue: branding },
      ],
    });
    const fixture = TestBed.createComponent(AccountShellComponent);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, status, logout, navigate, branding };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('muestra la oficina de la sesión y sus dos secciones', () => {
    const { component, page } = create();

    expect(page.textContent).toContain('CoreTaxPro');
    expect(page.textContent).toContain(component.t().accNavOverview);
    expect(page.textContent).toContain(component.t().accNavOffice);
  });

  // La marca de la oficina es pública, así que la cabecera la muestra en vez de un cuadro genérico.
  it('muestra el logo de la oficina cuando lo hay', () => {
    const { page, branding } = create('https://files/logo.png');

    expect(branding.load).toHaveBeenCalledOnce();
    expect(page.querySelector('img[alt="CoreTaxPro"]')?.getAttribute('src')).toBe('https://files/logo.png');
  });

  it('sin logo cae a las iniciales de la oficina', () => {
    const { page } = create(null);

    expect(page.querySelector('img[alt="CoreTaxPro"]')).toBeNull();
    expect(page.textContent).toContain('CO');
  });

  it('el menú de móvil se abre y se cierra al navegar', () => {
    const { component } = create();

    component.toggleMenu();
    expect(component.isMenuOpen()).toBe(true);

    component.closeMenu();
    expect(component.isMenuOpen()).toBe(false);
  });

  it('cerrar sesión lleva a la pantalla de entrada', () => {
    const { component, logout, navigate } = create();

    component.signOut();

    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/account/sign-in']);
  });

  // La sesión puede caer mientras el usuario está adentro (takeover o logout global).
  it('si la sesión muere en vivo, saca de las pantallas del Account', () => {
    const { fixture, status, navigate } = create();

    status.set('revoked');
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/account/session-ended']);
  });
});
