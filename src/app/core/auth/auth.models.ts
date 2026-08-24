/**
 * Contratos del backend de auth del landing (portados de LandingPageTaxProSuite).
 * Los nombres de campos (name/lastName/companyName/phoneNumber, tokenRequest/
 * tokenRefresh) son los que espera la API — no renombrar.
 */
export interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data?: T;
  statusCode?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember?: boolean;
}

export interface LoginResponse {
  tokenRequest: string;
  expireTokenRequest: string;
  tokenRefresh: string;
}

export interface RegisterData {
  name: string;
  lastName: string;
  email: string;
  companyName?: string;
  phoneNumber?: string;
  password: string;
}

export interface UserProfile {
  id: string;
  name: string;
  lastName: string;
  email: string;
  companyName?: string;
  phoneNumber?: string;
  isActive: boolean;
  confirm?: boolean;
  createdAt: string;
  updatedAt?: string;
  fullName?: string;
  displayName?: string;
}

export interface DecodedToken {
  sub: string;
  email: string;
  sid: string;
  given_name?: string;
  family_name?: string;
  exp: number;
}

/** Datos del conflicto 409 cuando ya hay una sesión abierta en otro dispositivo. */
export interface ExistingSessionInfo {
  message: string;
  location?: string;
}

export interface LoginResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
  existingSession?: ExistingSessionInfo;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
}

// Password reset — flujo por correo (link con email+token) + OTP de 8 dígitos.
export interface SendOtpData {
  email: string;
  token: string;
}

export interface ValidateOtpData {
  email: string;
  otp: string;
}

export interface ResetPasswordData {
  email: string;
  newPassword: string;
  token: string;
}

export interface PasswordResetResult {
  success: boolean;
  error?: string;
}
