import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AccountSessionService } from '@core/auth/account-session.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { AccountOfficeComponent } from './account-office.component';

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

describe('AccountOfficeComponent', () => {
  function create(officeBranding = vi.fn(() => of({ primary: '#1E466B', accent: '#67BAF4', logoUrl: '/tenants/branding/assets/f1', faviconUrl: null }))) {
    TestBed.configureTestingModule({
      imports: [AccountOfficeComponent],
      providers: [
        { provide: AccountSessionStore, useValue: { me: signal(admin) } },
        {
          provide: AccountSessionService,
          useValue: { officeBranding, assetUrl: (path: string) => `https://api.test${path}` },
        },
      ],
    });
    const fixture = TestBed.createComponent(AccountOfficeComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, page: fixture.nativeElement as HTMLElement, officeBranding };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('muestra la oficina y el administrador de la sesión', () => {
    const { page } = create();

    expect(page.textContent).toContain('CoreTaxPro');
    expect(page.textContent).toContain('Ada Lovelace');
    expect(page.textContent).toContain('ada@example.com');
  });

  it('pide el logo por el slug de la oficina y lo muestra', () => {
    const { page, officeBranding } = create();

    expect(officeBranding).toHaveBeenCalledWith('coretaxpro');
    expect(page.querySelector('img')?.getAttribute('src')).toBe('https://api.test/tenants/branding/assets/f1');
  });

  // El logo es decorativo: si el branding falla, la pantalla sigue siendo útil.
  it('sin logo cae a las iniciales de la oficina', () => {
    const { page } = create(vi.fn(() => throwError(() => new Error('offline'))));

    expect(page.querySelector('img')).toBeNull();
    expect(page.textContent).toContain('CO');
  });
});
