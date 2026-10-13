import type { Lang } from './translation.model';

/**
 * Copy del landing Taxoffix (propuesta C). Basado en funciones reales del
 * producto: nada de garantías, cifras de clientes ni reseñas inventadas —
 * la prueba social queda como placeholder hasta tener datos reales.
 */
const es = {
  nav: { features: 'Funciones', how: 'Cómo funciona', pricing: 'Precios', faq: 'FAQ' },
  access: 'Acceder',
  signIn: 'Iniciar sesión',
  goToApp: 'Ir a la app',
  scheduleDemo: 'Programar Demo',
  startNow: 'Comenzar Ahora',

  hero: {
    eyebrow: 'Para oficinas de impuestos',
    line1a: 'Cada',
    line1b: 'Cliente.',
    line1c: 'Cada Plazo.',
    line2: 'Bajo Control.',
    subtitle:
      'Clientes, documentos, firmas electrónicas y cobros en un solo lugar, para que veas qué vence y qué falta antes de que sea tarde.',
    micro: 'Demo sin compromiso · Cancela cuando quieras',
    pending: [
      { name: 'María', text: 'falta un documento' },
      { name: 'Carlos', text: 'vence en 3 días' },
      { name: 'Laura', text: 'factura sin pagar' },
      { name: 'Ana', text: 'contrato sin firmar' },
    ],
    done: [
      { name: 'María', text: 'Declaración presentada' },
      { name: 'Carlos', text: 'Plazo cumplido' },
      { name: 'Laura', text: 'Pago recibido' },
      { name: 'Ana', text: 'Contrato firmado' },
    ],
  },

  trust: {
    title: 'Seguridad y control para tu oficina',
    items: [
      'Verificación en dos pasos (2FA)',
      'Firmas con consentimiento ESIGN/UETA',
      'SSN y EIN enmascarados en pantalla',
      'Permisos por rol',
      'Marca y subdominio de tu oficina',
    ],
  },

  features: {
    badge: 'Funciones',
    titleA: 'Todo lo que necesitas en',
    titleB: 'un solo lugar',
    subtitle: 'Todo lo que tu oficina usa a diario, en un solo lugar.',
    demo: {
      hint: 'Pruébalo: toca para interactuar',
      clients: {
        label: 'Selecciona clientes',
        list: [
          { name: 'María González', note: 'Falta un documento' },
          { name: 'Carlos Ruiz', note: 'Vence en 3 días' },
          { name: 'Laura Fernández', note: 'Factura sin pagar' },
          { name: 'Ana Torres', note: 'Contrato sin firmar' },
        ],
        action: (n: number) => (n === 1 ? 'Enviar recordatorio a 1 cliente' : `Enviar recordatorio a ${n} clientes`),
      },
      tasks: {
        label: 'Esta semana',
        items: ['Presentar 1040-ES · Carlos Ruiz', 'Declaración trimestral 941', 'Pedir W-2 a Laura Fernández'],
        counter: (done: number, total: number) => `${done} de ${total} listas`,
      },
      sign: {
        label: 'Firma aquí con el mouse o el dedo',
        signed: 'Firmado',
        clear: 'Borrar',
        doc: 'Declaración 1040 · María González',
      },
      voice: {
        hold: 'Mantén presionado para grabar',
        slide: '← desliza para descartar',
        release: 'Suelta para enviar',
        discard: 'Suelta para descartar',
        sent: 'Nota de voz guardada en el expediente',
        again: 'Grabar otra',
      },
      upload: {
        tray: 'Arrastra un archivo a la caja',
        drop: 'Suelta aquí',
        uploading: 'Subiendo…',
        done: 'Enlace seguro creado',
        doneNote: 'Vence en 7 días · con contraseña',
        another: 'Subir otro',
        files: [
          { name: '1040-2025.pdf', size: '1,2 MB' },
          { name: 'W-2-Laura.pdf', size: '0,4 MB' },
        ],
      },
      pay: {
        invoice: 'Factura de María González',
        sub: 'Con enlace y QR de pago',
        slide: 'Desliza para marcar como pagada',
        done: 'Pago recibido',
        doneNote: 'Factura marcada como pagada',
      },
    },
    items: [
      {
        icon: 'people-outline',
        title: 'Clientes',
        desc: 'Cada cliente, su expediente completo. Perfil fiscal, documentos, notas, correos, SMS, llamadas, firmas y facturas en una sola ficha.',
        pills: ['Importa desde CSV', 'Excel'],
        cards: [
          { icon: 'person-outline', title: 'María González', sub: 'Expediente · Declaración 1040', chip: 'Falta un documento' },
          { icon: 'create-outline', title: 'Firma pendiente', sub: 'Consentimiento ESIGN/UETA', progress: 55 },
          { icon: 'checkmark-outline', title: 'Pago recibido', sub: 'Factura enviada con enlace de pago', dark: true },
        ],
      },
      {
        icon: 'calendar-outline',
        title: 'Tareas y plazos',
        desc: 'Plazos a la vista. Tablero de tareas con vencimientos estatutarios y series recurrentes (como 1040-ES y 941). Tu Dashboard muestra qué vence en los próximos 30 días.',
        pills: ['Series recurrentes', 'Dashboard'],
        cards: [
          { icon: 'time-outline', title: 'Vence en 3 días', sub: '1040-ES · Carlos Ruiz', chip: 'Requiere atención' },
          { icon: 'repeat-outline', title: 'Serie recurrente', sub: 'Formulario 941 · cada trimestre', progress: 75 },
          { icon: 'grid-outline', title: 'Dashboard', sub: 'Vencimientos de los próximos 30 días', dark: true },
        ],
      },
      {
        icon: 'create-outline',
        title: 'Firmas electrónicas',
        desc: 'Firmas que quedan documentadas. Envía documentos a firmar con consentimiento ESIGN/UETA y verificación por código. Recibes el PDF sellado, el certificado y un registro de auditoría verificable.',
        pills: ['ESIGN/UETA', 'Registro de auditoría'],
        cards: [
          { icon: 'create-outline', title: 'Firma pendiente', sub: 'Consentimiento ESIGN/UETA', chip: 'Enviada al cliente' },
          { icon: 'keypad-outline', title: 'Verificación por código', sub: 'El firmante confirma su identidad', progress: 80 },
          { icon: 'shield-checkmark-outline', title: 'PDF sellado y certificado', sub: 'Con registro de auditoría', dark: true },
        ],
      },
      {
        icon: 'chatbubbles-outline',
        title: 'Chat y llamadas',
        desc: 'Clientes que responden. Mensajes, notas de voz, llamadas y videollamadas con cada cliente, ligados a su expediente.',
        pills: ['Mensajes', 'Videollamadas'],
        cards: [
          { icon: 'chatbubble-outline', title: 'Laura Fernández', sub: '“¿Te envío mi W-2 hoy?”', chip: 'Nuevo mensaje' },
          { icon: 'videocam-outline', title: 'Videollamada', sub: 'Con Carlos Ruiz · su expediente', progress: 40 },
          { icon: 'mic-outline', title: 'Nota de voz', sub: 'Guardada en el expediente', dark: true },
        ],
      },
      {
        icon: 'document-text-outline',
        title: 'Documentos',
        desc: 'Documentos compartidos con control. Comparte por enlace seguro con vencimiento, contraseña y límite de accesos. Sin adjuntos perdidos en el correo.',
        pills: ['Enlace seguro', 'Contraseña'],
        cards: [
          { icon: 'link-outline', title: 'Enlace seguro', sub: 'Con vencimiento y contraseña', chip: 'Activo' },
          { icon: 'lock-closed-outline', title: 'Límite de accesos', sub: '3 de 5 accesos usados', progress: 60 },
          { icon: 'download-outline', title: 'Documento descargado', sub: 'Quedó registrado en el expediente', dark: true },
        ],
      },
      {
        icon: 'receipt-outline',
        title: 'Facturación y cobros',
        desc: 'Cobra sin perseguir. Emite facturas en PDF, comparte un enlace o QR de pago y revisa qué está pagado y qué sigue pendiente.',
        pills: ['Factura en PDF', 'Enlace o QR de pago'],
        cards: [
          { icon: 'receipt-outline', title: 'Factura en PDF', sub: 'Con enlace y QR de pago', chip: 'Enviada' },
          { icon: 'hourglass-outline', title: 'Pendiente de pago', sub: 'Laura Fernández', progress: 30 },
          { icon: 'checkmark-outline', title: 'Pago recibido', sub: 'Factura marcada como pagada', dark: true },
        ],
      },
    ],
  },

  benefits: {
    badge: 'Beneficios',
    titleA: 'Hecha para ayudarte a',
    titleB: 'organizarte',
    cards: [
      { icon: 'calendar-outline', title: 'Plazos fiscales a la vista', desc: 'Tu Dashboard muestra qué vence en los próximos 30 días.' },
      { icon: 'receipt-outline', title: 'Cobros sin perseguir', desc: 'Emite facturas, comparte un enlace o QR de pago y revisa qué sigue pendiente.' },
      { icon: 'people-outline', title: 'Clientes al día', desc: 'Cada cliente vive en su expediente: documentos, firmas, correos y facturas en una ficha.' },
      { icon: 'create-outline', title: 'Firmas documentadas', desc: 'Consentimiento ESIGN/UETA, verificación por código y registro de auditoría verificable.' },
      { icon: 'mail-open-outline', title: 'Menos correos sueltos', desc: 'Chat, correos y SMS ligados al expediente de cada cliente.' },
    ],
    ctaTitle: 'Entra a la próxima temporada con tu oficina en orden',
    chartLabel: 'Vencen esta semana',
  },

  steps: {
    titleA: 'Empieza en',
    titleB: '3 pasos',
    subtitle: 'De crear tu oficina a trabajar con orden, sin cambiar cómo atiendes a tus clientes.',
    items: [
      { title: 'Crea tu oficina', desc: 'Elige tu plan, ponle nombre y logo a tu oficina y entra a tu propio subdominio.' },
      { title: 'Carga tu cartera', desc: 'Importa tus clientes desde CSV o Excel e invita a tu equipo con roles y permisos.' },
      { title: 'Trabaja con orden', desc: 'Pide documentos, envía firmas y cobra desde el expediente de cada cliente.' },
    ],
    createOffice: 'Crear oficina',
    mockRows: ['Clientes', 'Equipo', 'Roles y permisos'],
  },

  team: {
    tag: 'Tu día a día',
    title: 'Menos papeleo, más tiempo para tus clientes',
    desc: 'Documentos, firmas y cobros en el expediente de cada cliente, para que atiendas todo desde un solo lugar.',
    pill: 'Plazo cumplido · Declaración 1040',
  },

  pricing: {
    badge: 'Precios',
    title: 'Elige el plan que se adapte a tu oficina',
    note: 'SMS y Wallet se pagan por uso. Puedes subir de plan cuando quieras y cancelar al final del período.',
    monthly: 'Mensual',
    annual: 'Anual',
    annualBadge: '2 meses gratis',
    perMonth: '/mes',
    perYear: '/año',
    popular: 'Más Popular',
    users: (n: number) => `Hasta ${n} usuarios`,
    reserve: 'Reservar Ahora',
    error: 'No pudimos cargar los planes. Inténtalo de nuevo.',
    retry: 'Reintentar',
  },

  faq: {
    titleA: 'Preguntas',
    titleB: 'frecuentes',
    items: [
      {
        q: '¿Ya uso hojas de cálculo y correo. Por qué cambiar?',
        a: 'Puedes importar tu lista de clientes desde CSV o Excel y empezar con un grupo pequeño. El expediente de cada cliente reúne lo que hoy tienes repartido en varios lugares.',
      },
      {
        q: '¿Mis datos y los de mis clientes están protegidos?',
        a: 'Usamos verificación en dos pasos, dispositivos de confianza y permisos por rol, y los datos sensibles como SSN y EIN se muestran enmascarados. Las firmas dejan un registro de auditoría verificable. Si necesitas detalles técnicos de infraestructura, pídelos en la demo.',
      },
      {
        q: '¿Mis clientes tendrán que aprender una app nueva?',
        a: 'No tienen que instalar nada: reciben un enlace seguro para firmar, pagar o descargar documentos desde su navegador.',
      },
      {
        q: '¿Las firmas electrónicas tienen validez legal?',
        a: 'Siguen un flujo con consentimiento ESIGN/UETA, verificación por código y registro de auditoría. Para tu caso específico, consulta con tu asesor legal.',
      },
      {
        q: '¿Cuánto cuesta y puedo cambiar de plan?',
        a: 'Los planes van de $49 a $299 al mes y el plan anual incluye 2 meses gratis. Puedes subir de plan cuando quieras y cancelar al final del período. SMS y Wallet se pagan por uso.',
      },
    ],
  },

  newsletter: {
    badge: 'Newsletter',
    titleA: 'Mantente',
    titleB: 'informado',
    subtitle: 'Recibe las últimas noticias y actualizaciones',
    placeholder: 'Tu correo electrónico',
    button: 'Suscribirme',
    thanks: '¡Gracias! Te mantendremos al tanto.',
    legalA: 'Al suscribirte aceptas nuestra',
    legalLink: 'Política de Privacidad',
  },

  cta: {
    titleA: 'Entra a la próxima temporada con',
    titleB: 'tu oficina en orden',
    subtitle: 'Agenda una demo y mira cómo se vería tu oficina en Taxoffix.',
  },

  footer: {
    tagline: 'Orden para tu oficina de impuestos.',
    privacy: 'Privacidad',
    terms: 'Términos',
    rights: 'Todos los derechos reservados.',
  },
};

export type LandingCopy = typeof es;

const en: LandingCopy = {
  nav: { features: 'Features', how: 'How it works', pricing: 'Pricing', faq: 'FAQ' },
  access: 'Access',
  signIn: 'Sign in',
  goToApp: 'Go to app',
  scheduleDemo: 'Schedule a Demo',
  startNow: 'Get Started',

  hero: {
    eyebrow: 'For tax offices',
    line1a: 'Every',
    line1b: 'Client.',
    line1c: 'Every Deadline.',
    line2: 'Under Control.',
    subtitle:
      'Clients, documents, e-signatures and payments in one place, so you can see what is due and what is missing before it is too late.',
    micro: 'No-commitment demo · Cancel anytime',
    pending: [
      { name: 'María', text: 'missing a document' },
      { name: 'Carlos', text: 'due in 3 days' },
      { name: 'Laura', text: 'unpaid invoice' },
      { name: 'Ana', text: 'unsigned contract' },
    ],
    done: [
      { name: 'María', text: 'Return filed' },
      { name: 'Carlos', text: 'Deadline met' },
      { name: 'Laura', text: 'Payment received' },
      { name: 'Ana', text: 'Contract signed' },
    ],
  },

  trust: {
    title: 'Security and control for your office',
    items: [
      'Two-step verification (2FA)',
      'Signatures with ESIGN/UETA consent',
      'SSN and EIN masked on screen',
      'Role-based permissions',
      'Your office brand and subdomain',
    ],
  },

  features: {
    badge: 'Features',
    titleA: 'Everything you need in',
    titleB: 'one place',
    subtitle: 'Everything your office uses every day, in one place.',
    demo: {
      hint: 'Try it: tap to interact',
      clients: {
        label: 'Select clients',
        list: [
          { name: 'María González', note: 'Missing a document' },
          { name: 'Carlos Ruiz', note: 'Due in 3 days' },
          { name: 'Laura Fernández', note: 'Unpaid invoice' },
          { name: 'Ana Torres', note: 'Unsigned contract' },
        ],
        action: (n: number) => (n === 1 ? 'Send reminder to 1 client' : `Send reminder to ${n} clients`),
      },
      tasks: {
        label: 'This week',
        items: ['File 1040-ES · Carlos Ruiz', 'Quarterly return 941', 'Request W-2 from Laura Fernández'],
        counter: (done: number, total: number) => `${done} of ${total} done`,
      },
      sign: {
        label: 'Sign here with your mouse or finger',
        signed: 'Signed',
        clear: 'Clear',
        doc: 'Form 1040 · María González',
      },
      voice: {
        hold: 'Press and hold to record',
        slide: '← slide to discard',
        release: 'Release to send',
        discard: 'Release to discard',
        sent: 'Voice note saved to the client file',
        again: 'Record another',
      },
      upload: {
        tray: 'Drag a file into the box',
        drop: 'Drop here',
        uploading: 'Uploading…',
        done: 'Secure link created',
        doneNote: 'Expires in 7 days · password protected',
        another: 'Upload another',
        files: [
          { name: '1040-2025.pdf', size: '1.2 MB' },
          { name: 'W-2-Laura.pdf', size: '0.4 MB' },
        ],
      },
      pay: {
        invoice: 'Invoice for María González',
        sub: 'With payment link and QR',
        slide: 'Slide to mark as paid',
        done: 'Payment received',
        doneNote: 'Invoice marked as paid',
      },
    },
    items: [
      {
        icon: 'people-outline',
        title: 'Clients',
        desc: 'Every client, a complete file. Tax profile, documents, notes, emails, SMS, calls, signatures and invoices in a single record.',
        pills: ['Import from CSV', 'Excel'],
        cards: [
          { icon: 'person-outline', title: 'María González', sub: 'File · Form 1040', chip: 'Missing a document' },
          { icon: 'create-outline', title: 'Signature pending', sub: 'ESIGN/UETA consent', progress: 55 },
          { icon: 'checkmark-outline', title: 'Payment received', sub: 'Invoice sent with a payment link', dark: true },
        ],
      },
      {
        icon: 'calendar-outline',
        title: 'Tasks and deadlines',
        desc: 'Deadlines in sight. A task board with statutory due dates and recurring series (like 1040-ES and 941). Your Dashboard shows what is due in the next 30 days.',
        pills: ['Recurring series', 'Dashboard'],
        cards: [
          { icon: 'time-outline', title: 'Due in 3 days', sub: '1040-ES · Carlos Ruiz', chip: 'Needs attention' },
          { icon: 'repeat-outline', title: 'Recurring series', sub: 'Form 941 · every quarter', progress: 75 },
          { icon: 'grid-outline', title: 'Dashboard', sub: 'Deadlines for the next 30 days', dark: true },
        ],
      },
      {
        icon: 'create-outline',
        title: 'E-signatures',
        desc: 'Signatures that stay documented. Send documents to sign with ESIGN/UETA consent and code verification. You get the sealed PDF, the certificate and a verifiable audit trail.',
        pills: ['ESIGN/UETA', 'Audit trail'],
        cards: [
          { icon: 'create-outline', title: 'Signature pending', sub: 'ESIGN/UETA consent', chip: 'Sent to client' },
          { icon: 'keypad-outline', title: 'Code verification', sub: 'The signer confirms their identity', progress: 80 },
          { icon: 'shield-checkmark-outline', title: 'Sealed PDF and certificate', sub: 'With an audit trail', dark: true },
        ],
      },
      {
        icon: 'chatbubbles-outline',
        title: 'Chat and calls',
        desc: 'Clients who respond. Messages, voice notes, calls and video calls with each client, tied to their file.',
        pills: ['Messages', 'Video calls'],
        cards: [
          { icon: 'chatbubble-outline', title: 'Laura Fernández', sub: '“Shall I send my W-2 today?”', chip: 'New message' },
          { icon: 'videocam-outline', title: 'Video call', sub: 'With Carlos Ruiz · his file', progress: 40 },
          { icon: 'mic-outline', title: 'Voice note', sub: 'Saved to the client file', dark: true },
        ],
      },
      {
        icon: 'document-text-outline',
        title: 'Documents',
        desc: 'Documents shared with control. Share through a secure link with an expiry date, a password and an access limit. No more attachments lost in email.',
        pills: ['Secure link', 'Password'],
        cards: [
          { icon: 'link-outline', title: 'Secure link', sub: 'With expiry and password', chip: 'Active' },
          { icon: 'lock-closed-outline', title: 'Access limit', sub: '3 of 5 accesses used', progress: 60 },
          { icon: 'download-outline', title: 'Document downloaded', sub: 'Recorded in the client file', dark: true },
        ],
      },
      {
        icon: 'receipt-outline',
        title: 'Billing and payments',
        desc: 'Get paid without chasing. Issue PDF invoices, share a payment link or QR, and see what is paid and what is still pending.',
        pills: ['PDF invoice', 'Payment link or QR'],
        cards: [
          { icon: 'receipt-outline', title: 'PDF invoice', sub: 'With payment link and QR', chip: 'Sent' },
          { icon: 'hourglass-outline', title: 'Payment pending', sub: 'Laura Fernández', progress: 30 },
          { icon: 'checkmark-outline', title: 'Payment received', sub: 'Invoice marked as paid', dark: true },
        ],
      },
    ],
  },

  benefits: {
    badge: 'Benefits',
    titleA: 'Built to help you get',
    titleB: 'organized',
    cards: [
      { icon: 'calendar-outline', title: 'Tax deadlines in sight', desc: 'Your Dashboard shows what is due in the next 30 days.' },
      { icon: 'receipt-outline', title: 'Get paid without chasing', desc: 'Issue invoices, share a payment link or QR and see what is still pending.' },
      { icon: 'people-outline', title: 'Clients up to date', desc: 'Each client lives in a file: documents, signatures, emails and invoices in one record.' },
      { icon: 'create-outline', title: 'Documented signatures', desc: 'ESIGN/UETA consent, code verification and a verifiable audit trail.' },
      { icon: 'mail-open-outline', title: 'Fewer loose emails', desc: 'Chat, emails and SMS tied to each client file.' },
    ],
    ctaTitle: 'Start the next tax season with your office in order',
    chartLabel: 'Due this week',
  },

  steps: {
    titleA: 'Get started in',
    titleB: '3 steps',
    subtitle: 'From creating your office to working in order, without changing how you serve your clients.',
    items: [
      { title: 'Create your office', desc: 'Choose your plan, name your office, add your logo and get your own subdomain.' },
      { title: 'Load your portfolio', desc: 'Import your clients from CSV or Excel and invite your team with roles and permissions.' },
      { title: 'Work in order', desc: 'Request documents, send signatures and get paid from each client file.' },
    ],
    createOffice: 'Create office',
    mockRows: ['Clients', 'Team', 'Roles and permissions'],
  },

  team: {
    tag: 'Your day to day',
    title: 'Less paperwork, more time for your clients',
    desc: 'Documents, signatures and payments in each client file, so you handle everything from one place.',
    pill: 'Deadline met · Form 1040',
  },

  pricing: {
    badge: 'Pricing',
    title: 'Choose the plan that fits your office',
    note: 'SMS and Wallet are pay-per-use. You can upgrade anytime and cancel at the end of the period.',
    monthly: 'Monthly',
    annual: 'Annual',
    annualBadge: '2 months free',
    perMonth: '/mo',
    perYear: '/yr',
    popular: 'Most Popular',
    users: (n: number) => `Up to ${n} users`,
    reserve: 'Reserve Now',
    error: 'We could not load the plans. Please try again.',
    retry: 'Retry',
  },

  faq: {
    titleA: 'Frequently asked',
    titleB: 'questions',
    items: [
      {
        q: 'I already use spreadsheets and email. Why switch?',
        a: 'You can import your client list from CSV or Excel and start with a small group. Each client file brings together what you now keep in several places.',
      },
      {
        q: 'Are my data and my clients’ data protected?',
        a: 'We use two-step verification, trusted devices and role-based permissions, and sensitive data such as SSN and EIN is shown masked. Signatures leave a verifiable audit trail. If you need technical infrastructure details, ask for them in the demo.',
      },
      {
        q: 'Will my clients have to learn a new app?',
        a: 'They do not have to install anything: they receive a secure link to sign, pay or download documents from their browser.',
      },
      {
        q: 'Do e-signatures have legal validity?',
        a: 'They follow a flow with ESIGN/UETA consent, code verification and an audit trail. For your specific case, consult your legal advisor.',
      },
      {
        q: 'How much does it cost and can I change plans?',
        a: 'Plans range from $49 to $299 per month and the annual plan includes 2 months free. You can upgrade anytime and cancel at the end of the period. SMS and Wallet are pay-per-use.',
      },
    ],
  },

  newsletter: {
    badge: 'Newsletter',
    titleA: 'Stay',
    titleB: 'informed',
    subtitle: 'Get the latest news and updates',
    placeholder: 'Your email address',
    button: 'Subscribe',
    thanks: 'Thanks! We will keep you posted.',
    legalA: 'By subscribing you accept our',
    legalLink: 'Privacy Policy',
  },

  cta: {
    titleA: 'Start the next tax season with',
    titleB: 'your office in order',
    subtitle: 'Book a demo and see how your office would look in Taxoffix.',
  },

  footer: {
    tagline: 'Order for your tax office.',
    privacy: 'Privacy',
    terms: 'Terms',
    rights: 'All rights reserved.',
  },
};

export const LANDING_COPY: Record<Lang, LandingCopy> = { es, en };
