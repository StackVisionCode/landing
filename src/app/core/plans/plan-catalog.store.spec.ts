import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlanCatalogStore } from './plan-catalog.store';
import type { PlanResponse } from './plans.models';

const plan = (monthly: number): PlanResponse =>
  ({ id: 'p1', code: 'enterprise', name: 'Enterprise', rank: 1, monthlyPriceUsd: monthly }) as unknown as PlanResponse;

describe('PlanCatalogStore', () => {
  function setup(platform: 'browser' | 'server') {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: platform }],
    });
    return { store: TestBed.inject(PlanCatalogStore), http: TestBed.inject(HttpTestingController) };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('in the browser asks the server again, skipping the prerendered prices', () => {
    const { store, http } = setup('browser');

    store.load();
    const first = http.expectOne((req) => req.url.endsWith('/plans') && req.transferCache !== false);
    first.flush([plan(99)]);

    const live = http.expectOne((req) => req.url.endsWith('/plans') && req.transferCache === false);
    live.flush([plan(300)]);

    expect(store.plans()[0].monthlyPriceUsd).toBe(300);
  });

  it('while prerendering asks only once', () => {
    const { store, http } = setup('server');

    store.load();
    http.expectOne((req) => req.url.endsWith('/plans')).flush([plan(99)]);

    expect(store.plans()[0].monthlyPriceUsd).toBe(99);
  });
});
