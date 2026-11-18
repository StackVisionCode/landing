import { vi } from 'vitest';
import { reloadOnBackForwardRestore } from './back-forward-restore';

describe('reloadOnBackForwardRestore', () => {
  it('recarga cuando el navegador restaura la página desde su caché (volver atrás desde la pasarela)', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    reloadOnBackForwardRestore(target, reload);

    target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('una carga normal no recarga', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    reloadOnBackForwardRestore(target, reload);

    target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));

    expect(reload).not.toHaveBeenCalled();
  });
});
