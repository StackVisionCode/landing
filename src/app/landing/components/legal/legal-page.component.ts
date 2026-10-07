import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslationStore } from '@core/i18n/translation.store';
import { OnboardingService } from '@core/onboarding/onboarding.service';

type LegalKind = 'TermsOfService' | 'PrivacyPolicy';
type LegalStep = 'loading' | 'ready' | 'error';

/** Mínimo de caracteres para buscar (con 1 letra se marcaría medio documento). */
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 150;
const HIT_CLASS = 'legal-search-hit';
const ACTIVE_HIT_CLASS = 'legal-search-hit--active';

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
export class LegalPageComponent implements OnInit, OnDestroy {
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

  // Buscador dentro del documento: resalta coincidencias con <mark> y salta entre ellas.
  private readonly article = viewChild<ElementRef<HTMLElement>>('legalArticle');
  protected readonly query = signal('');
  protected readonly matchCount = signal(0);
  protected readonly activeMatch = signal(0);
  private hits: HTMLElement[] = [];
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

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

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected retry(): void {
    this.load();
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.runSearch(), SEARCH_DEBOUNCE_MS);
  }

  /** Enter = siguiente, Shift+Enter = anterior, Escape = borrar. */
  protected onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.searchTimer) {
        // Enter antes de que venza el debounce: buscar ya, sin saltar dos veces.
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.runSearch();
        return;
      }
      this.goTo(this.activeMatch() + (event.shiftKey ? -1 : 1));
    } else if (event.key === 'Escape') {
      this.clearSearch();
    }
  }

  protected nextMatch(): void {
    this.goTo(this.activeMatch() + 1);
  }

  protected prevMatch(): void {
    this.goTo(this.activeMatch() - 1);
  }

  protected clearSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.query.set('');
    this.clearHighlights();
  }

  private runSearch(): void {
    this.searchTimer = null;
    this.clearHighlights();
    const root = this.article()?.nativeElement;
    const term = this.query().trim();
    if (!root || term.length < SEARCH_MIN_LENGTH) return;

    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    // Primero se juntan los nodos de texto y después se modifican: tocar el DOM mientras el
    // TreeWalker recorre lo desordena.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      pattern.lastIndex = 0;
      if (node.data && pattern.test(node.data)) textNodes.push(node);
    }

    for (const node of textNodes) {
      const fragment = document.createDocumentFragment();
      let last = 0;
      pattern.lastIndex = 0;
      for (const match of node.data.matchAll(pattern)) {
        const start = match.index ?? 0;
        if (start > last) fragment.append(node.data.slice(last, start));
        const mark = document.createElement('mark');
        mark.className = HIT_CLASS;
        mark.textContent = match[0];
        fragment.append(mark);
        this.hits.push(mark);
        last = start + match[0].length;
      }
      if (last < node.data.length) fragment.append(node.data.slice(last));
      node.replaceWith(fragment);
    }

    this.matchCount.set(this.hits.length);
    if (this.hits.length) this.goTo(0);
  }

  /** Activa la coincidencia `index` (circular) y la centra en pantalla. */
  private goTo(index: number): void {
    const total = this.hits.length;
    if (!total) return;
    const next = ((index % total) + total) % total;
    this.hits[this.activeMatch()]?.classList.remove(ACTIVE_HIT_CLASS);
    this.activeMatch.set(next);
    const hit = this.hits[next];
    hit.classList.add(ACTIVE_HIT_CLASS);
    hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Quita los <mark> devolviendo su texto y re-une los nodos de texto partidos. */
  private clearHighlights(): void {
    const parents = new Set<Node>();
    for (const hit of this.hits) {
      const parent = hit.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(hit.textContent ?? ''), hit);
      parents.add(parent);
    }
    parents.forEach(parent => parent.normalize());
    this.hits = [];
    this.matchCount.set(0);
    this.activeMatch.set(0);
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
    // El contenido se vuelve a pintar entero: los <mark> viejos desaparecen con él.
    this.hits = [];
    this.query.set('');
    this.matchCount.set(0);
    this.activeMatch.set(0);
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
