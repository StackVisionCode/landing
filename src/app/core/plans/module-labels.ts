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
  meetings: { es: 'Reuniones por vídeo', en: 'Video meetings' },
  marketing: { es: 'Herramientas de marketing', en: 'Marketing tools' },
  miles: { es: 'Registro de millaje', en: 'Mileage tracking' },
  builder: { es: 'Constructor de formularios', en: 'Form builder' },
  irs: { es: 'Herramientas para el IRS', en: 'IRS tools' },
};

/**
 * Los módulos que de verdad se venden — los que trae algún plan y se pueden comprar sueltos.
 *
 * `MODULE_LABELS` es un DICCIONARIO y sigue conteniendo los que ya no se ofrecen, porque una
 * suscripción vieja o un snapshot guardado pueden seguir nombrándolos y ahí hace falta un nombre
 * legible. Esta lista es otra cosa: lo que se le enseña a alguien que todavía no es cliente.
 *
 * `reports`, `marketing`, `builder`, `irs` y `miles` están fuera porque **no existen**: no tienen ni
 * un endpoint detrás ni pantalla en el producto. La página pública los anunciaba igual.
 */
export const OFFERED_MODULES: readonly string[] = [
  'customers',
  'documents',
  'planner',
  'signatures',
  'comms',
  'meetings',
  'email',
  'campaigns',
];

export function moduleLabel(key: string, lang: Lang): string {
  const entry = MODULE_LABELS[key];
  if (!entry) return key;
  return lang === 'en' ? entry.en : entry.es;
}

/** Ícono por módulo, mismo `key` que arriba — compartido entre el marquee del
 *  hero y la grilla de "Características" para no duplicarlo ni desincronizarlo. */
export const MODULE_ICONS: Record<string, string> = {
  signatures: 'create-outline',
  documents: 'document-text-outline',
  planner: 'checkbox-outline',
  customers: 'people-outline',
  email: 'mail-outline',
  reports: 'stats-chart-outline',
  campaigns: 'megaphone-outline',
  comms: 'chatbubbles-outline',
  meetings: 'videocam-outline',
  marketing: 'trending-up-outline',
  miles: 'car-outline',
  builder: 'construct-outline',
  irs: 'shield-checkmark-outline',
};

export function moduleIcon(key: string): string {
  return MODULE_ICONS[key] ?? 'apps-outline';
}
