import type { Lang } from '@core/i18n/translation.model';

/** Etiquetas legibles para los `enabledModules` que devuelve el backend —
 *  decorativas, se mantienen aparte del sistema de i18n de copy de marca.
 *  Compartido entre Pricing (lista completa) y Register (highlights del
 *  panel lateral) para no duplicar la traducción de cada módulo. */
export const MODULE_LABELS: Record<string, { es: string; en: string }> = {
  signatures: { es: 'Firmas electrónicas', en: 'E-signatures' },
  documents: { es: 'Gestión de documentos', en: 'Document management' },
  planner: { es: 'Planificador de tareas', en: 'Task planner' },
  customers: { es: 'Gestión de clientes', en: 'Client management' },
  email: { es: 'Correo integrado', en: 'Integrated email' },
  reports: { es: 'Reportes', en: 'Reports' },
  campaigns: { es: 'Campañas de marketing', en: 'Marketing campaigns' },
  comms: { es: 'Comunicación con clientes', en: 'Client communication' },
  marketing: { es: 'Herramientas de marketing', en: 'Marketing tools' },
  miles: { es: 'Registro de millaje', en: 'Mileage tracking' },
  builder: { es: 'Constructor de formularios', en: 'Form builder' },
  irs: { es: 'Herramientas para el IRS', en: 'IRS tools' },
};

export function moduleLabel(key: string, lang: Lang): string {
  const entry = MODULE_LABELS[key];
  if (!entry) return key;
  return lang === 'en' ? entry.en : entry.es;
}
