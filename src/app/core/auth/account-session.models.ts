/**
 * Contratos del Account (superficie `account` de Auth). El refresh nunca aparece acá: vive en la cookie
 * `__Host-tv-account-rt`, que el navegador manda sola con `withCredentials`.
 */

/** Cuerpo de los canjes de vale: `POST /auth/account/session/from-handoff|from-login|takeover`. */
export interface AccountTicketRequest {
  ticket: string;
  deviceName?: string | null;
}

/**
 * Respuesta de todo endpoint que abre o rota la sesión. Sin `accessToken` y con `takeoverRequired`
 * significa que ya hay otra sesión abierta y hay que confirmarla con el vale que viene.
 */
export interface AccountSessionResponse {
  accessToken: string | null;
  expiresInSeconds: number;
  takeoverRequired?: boolean;
  takeoverTicket?: string | null;
  takeoverTicketExpiresInSeconds?: number | null;
  /** Dispositivo de confianza recién creado; solo viene si se pidió al resolver el segundo factor. */
  deviceToken?: string | null;
}

/** Vale de un solo uso que emite el CRM para abrir el Account con la misma sesión. */
export interface AccountHandoffResponse {
  ticket: string;
  expiresInSeconds: number;
}

export interface MeTenant {
  id: string;
  name: string;
  subDomain: string;
}

/** `GET /auth/me` — recortado a lo que usa el Account; el backend devuelve más campos. */
export interface MeResponse {
  id: string;
  name: string;
  lastName: string;
  email: string;
  actorType: string;
  tenant: MeTenant;
  roles: string[];
  permissions: string[];
}

/** Marca pública de la oficina (`GET /tenants/branding/public/{slug}`): solo se usa el logo. */
export interface PublicBrandingResponse {
  primary: string;
  accent: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

/** Cuerpo de `POST /auth/reauthenticate`: el usuario confirma su contraseña (y el código si tiene TOTP). */
export interface ReauthenticateRequest {
  password: string;
  code?: string | null;
}

/**
 * Token de la MISMA sesión con `reauth_at`. El refresh no lo copia, así que la elevación dura como mucho
 * lo que ese access token: se pide de nuevo cuando vuelve a hacer falta.
 */
export interface ReauthenticateResponse {
  accessToken: string;
  expiresInSeconds: number;
  reauthenticatedAtUtc: string;
}

/** Solo el administrador de la oficina entra al Account; el backend aplica la misma regla. */
export const ACCOUNT_ACTOR_TYPE = 'TenantAdmin';
