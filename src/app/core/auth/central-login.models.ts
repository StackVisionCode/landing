/**
 * Login central multi-tenant: el usuario entra con email y contraseña sin saber su subdominio, y Auth lo
 * autentica contra todas sus oficinas. Son los mismos tres endpoints anónimos que usa el espacio de
 * trabajo; el Account solo cambia el último paso, porque canjea el vale por una sesión de su superficie.
 */

/** El Account es del personal de la oficina; las cuentas de cliente no se autentican acá. */
export const STAFF_ACCOUNT_KIND = 'Staff';

/** Una oficina donde la contraseña coincidió. */
export interface DiscoverOffice {
  tenantId: string;
  subdomain: string;
  tenantName: string;
  mfaRequired: boolean;
  isClientPortal: boolean;
}

/** `POST /auth/discover-login`: o ya viene el vale, o hay que elegir oficina y resolver el segundo factor. */
export interface DiscoverLoginResponse {
  subdomain: string | null;
  ticket: string | null;
  discoverySessionRef: string | null;
  offices: DiscoverOffice[] | null;
  isClientPortal: boolean | null;
}

/** `POST /auth/session/handoff`: subdominio destino y vale de un solo uso. */
export interface HandoffTicketResponse {
  subdomain: string;
  ticket: string;
}

/** El desenlace del primer paso, ya interpretado: la pantalla solo decide qué mostrar. */
export type DiscoverOutcome =
  | { kind: 'ticket'; ticket: string }
  | { kind: 'choose'; sessionRef: string; offices: DiscoverOffice[] };
