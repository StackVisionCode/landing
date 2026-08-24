import { Injectable } from '@angular/core';
import { DecodedToken } from './auth.models';

const TOKEN_KEY = 'landing_auth_token';
const REFRESH_TOKEN_KEY = 'landing_refresh_token';

/**
 * Almacena los JWT del landing en localStorage (mismas claves que el proyecto
 * viejo, así una sesión previa sigue siendo válida). Todos los accesos están
 * protegidos para SSR: en servidor no hay localStorage y todo devuelve null.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  get token(): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  }

  setTokens(token: string, refreshToken: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  removeTokens(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  decodeToken(): DecodedToken | null {
    const token = this.token;
    if (!token) {
      return null;
    }
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      return JSON.parse(jsonPayload) as DecodedToken;
    } catch {
      return null;
    }
  }

  isTokenExpired(): boolean {
    const decoded = this.decodeToken();
    if (!decoded) {
      return true;
    }
    return decoded.exp < Date.now() / 1000;
  }
}
