import { Injectable } from '@angular/core';

/**
 * El dispositivo de confianza del Account: lo que permite que el próximo login no vuelva a pedir el
 * código del segundo factor.
 *
 * Es lo único de la sesión que se guarda en disco. Puede hacerlo porque **no abre nada por sí solo**:
 * sin contraseña no sirve de nada, y lo que hace es reemplazar al segundo factor, no al primero. Por
 * eso sobrevive al logout — el navegador sigue siendo el mismo.
 *
 * El navegador del Landing es un origen distinto al del espacio de trabajo, así que cada superficie
 * marca su propio dispositivo. Es lo correcto: el token no viaja entre orígenes.
 */
const KEY = 'tvl.auth.deviceToken';

@Injectable({ providedIn: 'root' })
export class TrustedDeviceStore {
  /** Null también cuando el almacenamiento está bloqueado: se pedirá el código, que es el lado seguro. */
  read(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  save(token: string | null | undefined): void {
    if (!token) {
      return;
    }
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // Modo privado o almacenamiento lleno: se pierde el "no volver a preguntar", nada más.
    }
  }

  /** El backend rechazó el dispositivo (revocado o vencido): guardarlo ya no sirve. */
  forget(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nada que hacer.
    }
  }
}
