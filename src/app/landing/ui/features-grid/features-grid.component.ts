import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { TranslationStore } from '@core/i18n/translation.store';
import { ModalComponent } from '@shared/ui/modal/modal.component';
import { MODULE_LABELS, moduleIcon, moduleLabel } from '@core/plans/module-labels';

const MODULE_DESCRIPTIONS: Record<string, { es: string; en: string }> = {
  signatures: {
    es: 'Envía documentos para firma y recibe una notificación apenas se completen, con validez legal.',
    en: 'Send documents for signature and get notified as soon as they’re completed, with legal validity.',
  },
  documents: {
    es: 'Organiza, sube y comparte los documentos de tus clientes desde un solo lugar.',
    en: 'Organize, upload, and share your clients’ documents from one place.',
  },
  planner: {
    es: 'Organiza vencimientos y tareas de tu equipo con recordatorios automáticos.',
    en: 'Organize deadlines and your team’s tasks with automatic reminders.',
  },
  customers: {
    es: 'Centraliza el historial completo de cada cliente: documentos, notas y comunicaciones.',
    en: 'Centralize each client’s full history: documents, notes, and communications.',
  },
  email: {
    es: 'Envía y recibe correos con tus clientes sin salir de la plataforma.',
    en: 'Send and receive emails with your clients without leaving the platform.',
  },
  reports: {
    es: 'Reportes personalizables con métricas de tu oficina en tiempo real.',
    en: 'Customizable reports with real-time metrics for your office.',
  },
  campaigns: {
    es: 'Crea y envía campañas para mantener a tus clientes informados.',
    en: 'Create and send campaigns to keep your clients informed.',
  },
  comms: {
    es: 'Chatea con tus clientes en tiempo real, vinculado a su expediente.',
    en: 'Chat with your clients in real time, tied to their file.',
  },
  marketing: {
    es: 'Herramientas para promocionar tu oficina y atraer nuevos clientes.',
    en: 'Tools to promote your office and attract new clients.',
  },
  miles: {
    es: 'Registra el millaje de tus viajes de trabajo para deducciones fiscales.',
    en: 'Track your work-trip mileage for tax deductions.',
  },
  builder: {
    es: 'Crea formularios personalizados para recopilar información de tus clientes.',
    en: 'Build custom forms to collect information from your clients.',
  },
  irs: {
    es: 'Herramientas específicas para trámites y cumplimiento ante el IRS.',
    en: 'Purpose-built tools for IRS filings and compliance.',
  },
};

interface ModuleCard {
  key: string;
  icon: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-features-grid',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ModalComponent],
  templateUrl: './features-grid.component.html',
})
export class FeaturesGridComponent {
  private readonly translation = inject(TranslationStore);
  protected readonly t = this.translation.t;

  /** Todos los módulos reales del catálogo (mismo `MODULE_LABELS` que Pricing
   *  y Register) — "todo lo que ofrecemos", no una selección curada. */
  protected get modules(): ModuleCard[] {
    const lang = this.translation.lang();
    return Object.keys(MODULE_LABELS).map((key) => ({
      key,
      icon: moduleIcon(key),
      label: moduleLabel(key, lang),
      description: MODULE_DESCRIPTIONS[key]?.[lang] ?? '',
    }));
  }

  /** Módulo abierto en el modal — null = cerrado. */
  protected readonly selected = signal<ModuleCard | null>(null);

  open(module: ModuleCard): void {
    this.selected.set(module);
  }

  close(): void {
    this.selected.set(null);
  }
}
