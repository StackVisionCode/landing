import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationStore } from '@core/i18n/translation.store';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [NotFoundComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
    return { page: fixture.nativeElement as HTMLElement, t: TestBed.inject(TranslationStore).t };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('explica que la página no existe', () => {
    const { page, t } = render();

    expect(page.querySelector('h1')?.textContent).toContain(t().notFoundTitle);
  });

  it('ofrece volver al inicio y a la suscripción', () => {
    const { page } = render();

    const hrefs = Array.from(page.querySelectorAll('main a')).map(link => link.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/account']);
  });
});
