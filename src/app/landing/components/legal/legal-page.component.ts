import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslationStore } from '@core/i18n/translation.store';
import { OnboardingService } from '@core/onboarding/onboarding.service';

type LegalKind = 'TermsOfService' | 'PrivacyPolicy';
type LegalStep = 'loading' | 'ready' | 'error';

/**
 * Página legal pública (/terms, /privacy). Renderiza el HTML del documento vigente que devuelve el
 * backend (endpoints públicos de onboarding/terms — text/html), con tipografía propia (.legal-prose,
 * en styles.css global, porque el HTML entra por [innerHTML] y Angular lo sanea + los estilos scoped
 * no alcanzan al contenido inyectado). El `kind` llega por route data. Los documentos solo se publican
 * en en-US (mismo criterio que register-complete), así que la locale se fija ahí; el chrome se localiza.
 */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './legal-page.component.html',
})
export class LegalPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly onboarding = inject(OnboardingService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;

  protected readonly kind = signal<LegalKind>('TermsOfService');
  protected readonly step = signal<LegalStep>('loading');
  protected readonly content = signal<SafeHtml | string>('');
  protected readonly version = signal('');
  protected readonly effectiveFromUtc = signal<string | null>(null);

  get title(): string {
    return this.kind() === 'PrivacyPolicy' ? this.t().footerPrivacyPolicy : this.t().footerTermsOfService;
  }

  get otherLink(): { path: string; label: string } {
    return this.kind() === 'PrivacyPolicy'
      ? { path: '/terms', label: this.t().footerTermsOfService }
      : { path: '/privacy', label: this.t().footerPrivacyPolicy };
  }

  ngOnInit(): void {
    const kind = (this.route.snapshot.data['kind'] as LegalKind) ?? 'TermsOfService';
    this.kind.set(kind);
    this.load();
  }

  protected retry(): void {
    this.load();
  }

  /** Los anchors del índice son `href="#seccion"`. Con el `<base href="/">` de Angular, un fragmento
   *  suelto resuelve contra la raíz y navega al landing en vez de hacer scroll. Se intercepta el clic,
   *  se cancela la navegación y se hace scroll al elemento por id (que sobrevive gracias al bypass). */
  protected onContentClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href') ?? '';
    if (!href.startsWith('#') || href.length < 2) return;
    event.preventDefault();
    document
      .getElementById(decodeURIComponent(href.slice(1)))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** El backend devuelve el documento como HTML COMPLETO (con su propio <head><style>). Se extrae solo
   *  el <body> para conservar los ids de sección y los anchors del índice —que la sanitización por
   *  defecto de [innerHTML] eliminaba, rompiendo el scroll— y descartar los estilos globales del doc
   *  (los aplica .legal-prose). Es contenido propio y confiable (sin <script>), así que se marca como
   *  HTML seguro para que los ids no se saneen. */
  private toSafeBody(html: string): SafeHtml {
    let body = html;
    try {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      body = parsed.body?.innerHTML || html;
    } catch {
      body = html;
    }
    return this.sanitizer.bypassSecurityTrustHtml(body);
  }

  private load(): void {
    this.step.set('loading');
    // Documentos publicados solo en en-US (ver register-complete): fijar la locale evita un
    // TermsVersion.NotFound si nunca se publicó "es".
    this.onboarding.getCurrentTerms('en-US', this.kind()).subscribe({
      next: (terms) => {
        this.version.set(terms.version);
        this.effectiveFromUtc.set(terms.effectiveFromUtc);
        if (!terms.contentUri) {
          this.step.set('error');
          return;
        }
        this.onboarding.getTermsContent(terms.contentUri).subscribe({
          next: (html) => {
            this.content.set(this.toSafeBody(html));
            this.step.set('ready');
          },
          error: () => this.step.set('error'),
        });
      },
      error: () => this.step.set('error'),
    });
  }
}
