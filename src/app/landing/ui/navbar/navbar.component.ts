import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  QueryList,
  ViewChildren,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslationStore } from '@core/i18n/translation.store';
import { SITE_CONFIG } from '@core/config/site-config';
import { AuthModalComponent } from '@shared/ui/auth-modal/auth-modal.component';
import { AuthService } from '@core/auth/auth.service';

interface NavLinkDef {
  id: string;
  key: 'navFeatures' | 'navProducts' | 'navPricing' | 'navFaq';
}

const NAV_LINK_DEFS: NavLinkDef[] = [
  { id: 'features', key: 'navFeatures' },
  { id: 'products', key: 'navProducts' },
  { id: 'pricing', key: 'navPricing' },
  { id: 'faq', key: 'navFaq' },
];

/** Altura del header sticky + aire, para que la sección no quede tapada al hacer scroll. */
const HEADER_OFFSET = 80;

@Component({
  selector: 'app-navbar',
  imports: [AuthModalComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements AfterViewInit, OnDestroy {
  protected readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;
  protected readonly lang = this.translation.lang;
  protected readonly siteConfig = SITE_CONFIG;

  private readonly authService = inject(AuthService);
  protected readonly currentUser = this.authService.currentUser;
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly mobileMenuOpen = signal(false);
  protected readonly showAuthModal = signal(false);

  /** Enlaces del nav con su label ya traducido — se recalcula al cambiar de idioma. */
  protected readonly navLinks = computed(() => NAV_LINK_DEFS.map((def) => ({ id: def.id, label: this.t()[def.key] })));

  /** Sección actualmente bajo el header, según scroll (scroll-spy). */
  protected readonly activeSection = signal<string | null>(null);
  private hoveredSection: string | null = null;

  /** Posición/ancho del "pill" deslizante, en px relativos al contenedor del nav. */
  protected readonly sliderStyle = signal({ left: 0, width: 0, opacity: 0 });

  @ViewChildren('navLink') private navLinkEls?: QueryList<ElementRef<HTMLAnchorElement>>;

  private sections: HTMLElement[] = [];
  private readonly onResize = () => this.updateSlider();

  private tickingScroll = false;
  private readonly onScroll = () => {
    if (this.tickingScroll) {
      return;
    }
    this.tickingScroll = true;
    requestAnimationFrame(() => {
      this.pickActiveSection();
      this.tickingScroll = false;
    });
  };

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.sections = NAV_LINK_DEFS.map((def) => document.getElementById(def.id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (this.sections.length) {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      this.pickActiveSection();
    }
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onResize);
    }
  }

  /** Última sección cuyo borde superior ya cruzó la línea de referencia
   *  (justo bajo el header) — se recalcula siempre desde posiciones en vivo,
   *  sin estado acumulado que pueda quedar obsoleto. */
  private pickActiveSection(): void {
    const referenceLine = HEADER_OFFSET + 16;
    let activeId: string | null = null;

    for (const section of this.sections) {
      if (section.getBoundingClientRect().top <= referenceLine) {
        activeId = section.id;
      }
    }

    this.activeSection.set(activeId);

    // El scroll manda siempre sobre un hover que haya quedado colgado (p.ej.
    // el mouse quieto sobre el link recién clickeado mientras el usuario
    // sigue scrolleando con el trackpad/teclado — el header es sticky, así
    // que el link nunca deja de estar bajo el cursor y (mouseleave) nunca
    // dispara). Sin esto, el texto activo se actualizaba bien pero el pill
    // quedaba pegado para siempre en el link donde se hizo click.
    this.hoveredSection = null;
    this.updateSlider();
  }

  protected onLinkHover(id: string): void {
    this.hoveredSection = id;
    this.updateSlider(id);
  }

  protected onNavLeave(): void {
    this.hoveredSection = null;
    this.updateSlider();
  }

  private updateSlider(targetId?: string): void {
    const id = targetId ?? this.hoveredSection ?? this.activeSection();
    const index = id ? NAV_LINK_DEFS.findIndex((def) => def.id === id) : -1;
    const el = index >= 0 ? this.navLinkEls?.get(index)?.nativeElement : undefined;

    if (!el) {
      this.sliderStyle.set({ left: 0, width: 0, opacity: 0 });
      return;
    }

    this.sliderStyle.set({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
  }

  protected scrollToSection(event: Event, id: string): void {
    event.preventDefault();

    if (!isPlatformBrowser(this.platformId)) {
      this.closeMobileMenu();
      return;
    }

    // Si el menú móvil está abierto, cerrarlo cambia el alto de la página
    // (el <nav> desplegado ocupa varios cientos de px). Angular lo saca del
    // DOM de forma asíncrona, así que medir la sección destino en el mismo
    // tick usa el layout viejo — el scroll calculado queda inflado por esa
    // altura y termina de largo, saltándose la sección. Esperar dos frames a
    // que el layout se asiente antes de medir y hacer scroll.
    const wasMobileMenuOpen = this.mobileMenuOpen();
    this.closeMobileMenu();

    // No se resalta el destino al instante: el pill sigue lo que hay
    // realmente en pantalla en cada momento (vía el scroll-spy normal),
    // incluso mientras dura la animación — así nunca puede mostrar una
    // sección distinta a la que se ve.
    const performScroll = () => {
      const target = document.getElementById(id);
      if (!target) {
        return;
      }
      const top = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
      window.scrollTo({ top, behavior: 'smooth' });
    };

    if (wasMobileMenuOpen) {
      requestAnimationFrame(() => requestAnimationFrame(performScroll));
    } else {
      performScroll();
    }
  }

  openAuthModal(): void {
    this.showAuthModal.set(true);
    this.closeMobileMenu();
  }

  signOut(): void {
    this.authService.logout();
    this.closeMobileMenu();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleLang(): void {
    this.translation.toggle();
    if (isPlatformBrowser(this.platformId)) {
      // El ancho de los links cambia con el idioma — remedir tras el repintado.
      requestAnimationFrame(() => this.updateSlider());
    }
  }
}
