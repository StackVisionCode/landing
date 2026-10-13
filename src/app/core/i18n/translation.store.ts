import { Injectable, computed, signal } from '@angular/core';
import type { Lang } from './translation.model';
import { es } from './locales/es';
import { en } from './locales/en';
import { LANDING_COPY } from './landing-copy';

const TRANSLATIONS = { es, en } as const;
const STORAGE_KEY = 'tpo.lang.v1';

/** Idioma actual del landing (EN por defecto) + textos derivados, persistido en localStorage. */
@Injectable({ providedIn: 'root' })
export class TranslationStore {
  private readonly _lang = signal<Lang>(this.loadInitialLang());

  readonly lang = this._lang.asReadonly();
  readonly t = computed(() => TRANSLATIONS[this._lang()]);
  /** Copy del landing público (propuesta C), separado del resto del i18n. */
  readonly c = computed(() => LANDING_COPY[this._lang()]);

  setLang(lang: Lang): void {
    this._lang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // SSR o modo privado: no-op.
    }
  }

  toggle(): void {
    this.setLang(this._lang() === 'es' ? 'en' : 'es');
  }

  private loadInitialLang(): Lang {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'es' ? 'es' : 'en';
    } catch {
      return 'en';
    }
  }
}
