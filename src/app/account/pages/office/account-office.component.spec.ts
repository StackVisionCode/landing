import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AccountSessionService } from '@core/auth/account-session.service';
import { AccountSessionStore } from '@core/auth/account-session.store';
import { OfficeProfile, OfficeProfileService } from '@core/account/office-profile.service';
import { officeWorkspaceUrl } from '@core/config/site-config';
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

const physical = {
  line1: '100 Main St',
  line2: 'Suite 4',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
};

const fullProfile: OfficeProfile = {
  legalName: 'CoreTaxPro LLC',
  ein: '12-3456789',
  physicalAddress: physical,
  mailingSameAsPhysical: true,
  mailingAddress: null,
};

// Lo que responde Tenant cuando la oficina nunca guardó su perfil.
const emptyProfile: OfficeProfile = {
  legalName: null,
  ein: null,
  physicalAddress: {
    line1: null,
    line2: null,
    city: null,
    state: null,
    postalCode: null,
    country: 'US',
  },
  mailingSameAsPhysical: true,
  mailingAddress: null,
};

describe('AccountOfficeComponent', () => {
  function create(
    options: {
      officeBranding?: ReturnType<typeof vi.fn>;
      profile?: () => Observable<OfficeProfile>;
    } = {},
  ) {
    const officeBranding =
      options.officeBranding ??
      vi.fn(() =>
        of({
          primary: '#1E466B',
          accent: '#67BAF4',
          logoUrl: '/tenants/branding/assets/f1',
          faviconUrl: null,
        }),
      );
    const getProfile = vi.fn(options.profile ?? (() => of(fullProfile)));
    TestBed.configureTestingModule({
      imports: [AccountOfficeComponent],
      providers: [
        { provide: AccountSessionStore, useValue: { me: signal(admin) } },
        {
          provide: AccountSessionService,
          useValue: { officeBranding, assetUrl: (path: string) => `https://api.test${path}` },
        },
        { provide: OfficeProfileService, useValue: { get: getProfile } },
      ],
    });
    const fixture = TestBed.createComponent(AccountOfficeComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const billing = () => page.querySelector('[data-testid="billing-details"]') as HTMLElement;
    return {
      fixture,
      component: fixture.componentInstance,
      page,
      billing,
      officeBranding,
      getProfile,
    };
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
    expect(page.querySelector('img')?.getAttribute('src')).toBe(
      'https://api.test/tenants/branding/assets/f1',
    );
  });

  // El logo es decorativo: si el branding falla, la pantalla sigue siendo útil.
  it('sin logo cae a las iniciales de la oficina', () => {
    const { page } = create({
      officeBranding: vi.fn(() => throwError(() => new Error('offline'))),
    });

    expect(page.querySelector('img')).toBeNull();
    expect(page.textContent).toContain('CO');
  });

  describe('Billing details', () => {
    it('perfil completo: nombre legal, EIN y dirección física, sin aviso', () => {
      const { billing } = create();

      expect(billing().querySelector('[data-testid="billing-legal-name"]')?.textContent).toContain(
        'CoreTaxPro LLC',
      );
      expect(billing().querySelector('[data-testid="billing-ein"]')?.textContent).toContain(
        '12-3456789',
      );
      const address = billing().querySelector('[data-testid="billing-address"]')?.textContent ?? '';
      expect(address).toContain('100 Main St');
      expect(address).toContain('Suite 4');
      expect(address).toContain('Austin, TX 78701');
      expect(billing().querySelector('[data-testid="billing-incomplete"]')).toBeNull();
    });

    it('perfil incompleto: avisa qué falta', () => {
      const { billing } = create({
        profile: () => of({ ...fullProfile, ein: '  ', physicalAddress: null }),
      });

      const notice =
        billing().querySelector('[data-testid="billing-incomplete"]')?.textContent ?? '';
      expect(notice).toContain('EIN');
      expect(notice).toContain('Address');
      expect(notice).not.toContain('Legal name');
      expect(billing().querySelector('[data-testid="billing-ein"]')).toBeNull();
      expect(billing().textContent).toContain('Not set');
    });

    it('sin perfil guardado: faltan los tres datos', () => {
      const { billing } = create({ profile: () => of(emptyProfile) });

      const notice =
        billing().querySelector('[data-testid="billing-incomplete"]')?.textContent ?? '';
      expect(notice).toContain('Legal name');
      expect(notice).toContain('EIN');
      expect(notice).toContain('Address');
    });

    it('usa la dirección postal cuando es distinta de la física', () => {
      const { billing } = create({
        profile: () =>
          of({
            ...fullProfile,
            mailingSameAsPhysical: false,
            mailingAddress: {
              line1: 'PO Box 77',
              line2: null,
              city: 'Toronto',
              state: 'ON',
              postalCode: 'M5V',
              country: 'CA',
            },
          }),
      });

      const address = billing().querySelector('[data-testid="billing-address"]')?.textContent ?? '';
      expect(address).toContain('PO Box 77');
      expect(address).toContain('Toronto, ON M5V');
      expect(address).toContain('CA');
      expect(address).not.toContain('100 Main St');
    });

    it('usa la física si la postal viene marcada como igual aunque traiga datos', () => {
      const { billing } = create({
        profile: () =>
          of({
            ...fullProfile,
            mailingSameAsPhysical: true,
            mailingAddress: { ...physical, line1: 'PO Box 77' },
          }),
      });

      const address = billing().querySelector('[data-testid="billing-address"]')?.textContent ?? '';
      expect(address).toContain('100 Main St');
      expect(address).not.toContain('PO Box 77');
    });

    it('usa la física si la postal es distinta pero viene vacía', () => {
      const { billing } = create({
        profile: () => of({ ...fullProfile, mailingSameAsPhysical: false, mailingAddress: null }),
      });

      expect(billing().querySelector('[data-testid="billing-address"]')?.textContent).toContain(
        '100 Main St',
      );
      expect(billing().querySelector('[data-testid="billing-incomplete"]')).toBeNull();
    });

    it('si falla la carga muestra el error y reintenta', () => {
      let calls = 0;
      const { fixture, billing, getProfile } = create({
        profile: () => (++calls === 1 ? throwError(() => new Error('403')) : of(fullProfile)),
      });

      expect(billing().querySelector('[data-testid="billing-error"]')).not.toBeNull();
      expect(billing().querySelector('[data-testid="billing-incomplete"]')).toBeNull();

      (
        billing().querySelector('[data-testid="billing-error"] button') as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(getProfile).toHaveBeenCalledTimes(2);
      expect(billing().querySelector('[data-testid="billing-error"]')).toBeNull();
      expect(billing().querySelector('[data-testid="billing-legal-name"]')?.textContent).toContain(
        'CoreTaxPro LLC',
      );
    });

    it('el botón lleva a /company/settings del espacio de trabajo de la oficina', () => {
      const { billing } = create();

      expect(billing().querySelector('[data-testid="billing-edit"]')?.getAttribute('href')).toBe(
        officeWorkspaceUrl('coretaxpro', '/company/settings'),
      );
      expect(officeWorkspaceUrl('coretaxpro', '/company/settings')).toMatch(
        /^https:\/\/coretaxpro\..+\/company\/settings$/,
      );
    });
  });
});
