import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { SITE_CONFIG } from '@core/config/site-config';
import { AccountSessionService } from './account-session.service';
import { AccountSessionStore } from './account-session.store';
import { CentralLoginService } from './central-login.service';
import { TrustedDeviceStore } from './trusted-device.store';

/**
 * El dispositivo de confianza del Landing, de punta a punta: nace al resolver el segundo factor, se
 * guarda, y vuelve en el siguiente login para que no se pida el código otra vez.
 *
 * El Landing es un origen distinto al del espacio de trabajo, así que este token es suyo: marcar el
 * navegador en el CRM no marca el Account ni al revés.
 */
describe('Dispositivo de confianza del Account', () => {
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('CentralLoginService', () => {
    function setup() {
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
      return {
        service: TestBed.inject(CentralLoginService),
        http: TestBed.inject(HttpTestingController),
        device: TestBed.inject(TrustedDeviceStore),
      };
    }

    it('manda el dispositivo guardado al probar la contraseña', () => {
      const { service, http, device } = setup();
      device.save('dev-1');

      service.discover('ada@acme.test', 'secret').subscribe();

      const call = http.expectOne(`${SITE_CONFIG.apiUrl}/auth/discover-login`);
      expect(call.request.body.deviceToken).toBe('dev-1');
    });

    it('sin dispositivo guardado manda null, no undefined', () => {
      // `undefined` desaparece al serializar y el backend recibiría un cuerpo distinto según el
      // navegador; `null` es siempre el mismo cuerpo.
      const { service, http } = setup();

      service.discover('ada@acme.test', 'secret').subscribe();

      const call = http.expectOne(`${SITE_CONFIG.apiUrl}/auth/discover-login`);
      expect(call.request.body.deviceToken).toBeNull();
    });

    it('el pedido de recordar viaja con la elección de oficina', () => {
      const { service, http } = setup();

      service.handoff('ref-1', 't-1', '123456', true).subscribe();

      const call = http.expectOne(`${SITE_CONFIG.apiUrl}/auth/session/handoff`);
      expect(call.request.body.rememberDevice).toBe(true);
    });
  });

  describe('AccountSessionStore', () => {
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

    function setup(overrides: object = {}) {
      const api = {
        refresh: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900 })),
        fromLogin: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900, deviceToken: 'dev-new' })),
        takeover: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900 })),
        me: vi.fn(() => of(admin)),
        ...overrides,
      };
      TestBed.configureTestingModule({ providers: [{ provide: AccountSessionService, useValue: api }] });
      return { store: TestBed.inject(AccountSessionStore), device: TestBed.inject(TrustedDeviceStore), api };
    }

    it('guarda el dispositivo que devuelve el canje', () => {
      const { store, device } = setup();

      store.startFromLogin('tk-1').subscribe();

      expect(device.read()).toBe('dev-new');
    });

    it('un canje sin dispositivo no borra el que ya había', () => {
      // Entrar sin marcar la casilla no es revocar: el navegador sigue siendo de confianza.
      const { store, device } = setup({
        fromLogin: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900 })),
      });
      device.save('dev-viejo');

      store.startFromLogin('tk-1').subscribe();

      expect(device.read()).toBe('dev-viejo');
    });

    it('el dispositivo también llega por el camino del takeover', () => {
      // Se marca la casilla ANTES del interstitial; el backend difiere el alta hasta que se confirma.
      const { store, device } = setup({
        takeover: vi.fn(() => of({ accessToken: 'at-1', expiresInSeconds: 900, deviceToken: 'dev-takeover' })),
      });

      store.confirmTakeover('tk-takeover').subscribe();

      expect(device.read()).toBe('dev-takeover');
    });
  });
});
