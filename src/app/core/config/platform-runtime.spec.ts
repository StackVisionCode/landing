import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLATFORM_FALLBACK,
  apiBaseFor,
  applyPlatformSettings,
  domainFromHost,
  loadPlatformRuntime,
  platformRuntime,
  resetPlatformRuntimeForTests,
} from './platform-runtime';

/**
 * El landing no lleva el dominio ni la marca "horneados": salen del host y de PlatformSettings. Si esto
 * se rompe, un cambio de dominio o de nombre desde PlatformAdmin vuelve a exigir recompilar el landing.
 */
describe('platformRuntime', () => {
  afterEach(() => {
    resetPlatformRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it('el dominio sale del host que sirve el landing (apex o www)', () => {
    expect(domainFromHost('www.newbrand.com')).toBe('newbrand.com');
    expect(domainFromHost('NewBrand.com.')).toBe('newbrand.com');
    expect(domainFromHost('taxoffix.io')).toBe('taxoffix.io');
  });

  it('sin un host público (localhost, IP, prerender) usa el respaldo', () => {
    expect(domainFromHost('localhost')).toBe(PLATFORM_FALLBACK.domain);
    expect(domainFromHost('127.0.0.1')).toBe(PLATFORM_FALLBACK.domain);
    expect(domainFromHost(null)).toBe(PLATFORM_FALLBACK.domain);
  });

  it('la API es api.{dominio}, salvo en localhost que va al gateway local', () => {
    expect(apiBaseFor('www.newbrand.com')).toBe('https://api.newbrand.com');
    expect(apiBaseFor('localhost')).toBe('http://localhost:5047');
  });

  it('aplica marca y razón social publicadas e ignora vacíos', () => {
    resetPlatformRuntimeForTests('www.newbrand.com');

    applyPlatformSettings({ brandName: 'NewBrand', legalName: ' ' });

    expect(platformRuntime()).toEqual({ domain: 'newbrand.com', brandName: 'NewBrand', legalName: 'TaxOffix LLC' });
  });

  it('lee /platform/settings/public de la API', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ brandName: 'NewBrand', legalName: 'NewBrand Inc.' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await loadPlatformRuntime('https://api.newbrand.com/');

    expect(fetchMock).toHaveBeenCalledWith('https://api.newbrand.com/platform/settings/public', expect.anything());
    expect(platformRuntime().legalName).toBe('NewBrand Inc.');
  });

  it('si la API no contesta arranca con el respaldo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));

    await loadPlatformRuntime('https://api.taxoffix.io');

    expect(platformRuntime().brandName).toBe(PLATFORM_FALLBACK.brandName);
  });
});
