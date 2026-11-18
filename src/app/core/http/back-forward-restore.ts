/**
 * Volver con "Atrás" desde la pasarela (PayPal, Stripe) restaura la página de la caché del navegador tal como quedó:
 * con botones en "Opening checkout..." y datos viejos. Se recarga para que todo vuelva al estado real.
 */
export function reloadOnBackForwardRestore(target: EventTarget, reload: () => void): void {
  target.addEventListener('pageshow', event => {
    if ((event as PageTransitionEvent).persisted) {
      reload();
    }
  });
}
