import { TurnstileWidget, loadTurnstile, resetTurnstileLoaderForTests } from './turnstile.loader';

/**
 * Turnstile puede no cargar (red que corta Cloudflare, bloqueadores): la página no debe quedarse esperando
 * sin decir nada. El cargador se rinde a tiempo y permite reintentar; el widget avisa el código de error.
 */
describe('Turnstile', () => {
  afterEach(() => {
    delete (window as { turnstile?: unknown }).turnstile;
    document.head
      .querySelectorAll('script[src*="challenges.cloudflare.com"]')
      .forEach((s) => s.remove());
    resetTurnstileLoaderForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('si el script no llega a tiempo se rinde, quita el script y deja reintentar', async () => {
    vi.useFakeTimers();
    const first = loadTurnstile(document, 8000);
    const failed = expect(first).rejects.toThrow('turnstile');

    vi.advanceTimersByTime(8000);
    await failed;

    expect(document.head.querySelectorAll('script[src*="challenges.cloudflare.com"]').length).toBe(
      0,
    );
    void loadTurnstile(document, 8000).catch(() => undefined);
    expect(document.head.querySelectorAll('script[src*="challenges.cloudflare.com"]').length).toBe(
      1,
    );
  });

  it('un error de Cloudflare se registra con su código y entrega "sin token" al que espera', async () => {
    let options: { 'error-callback': (code?: string) => void } | null = null;
    (window as { turnstile?: unknown }).turnstile = {
      render: (_: HTMLElement, o: typeof options) => {
        options = o;
        return 'w1';
      },
      reset: () => undefined,
      remove: () => undefined,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const widget = new TurnstileWidget();
    await widget.mount(document.createElement('div'), 'site-key');

    const pending = widget.next();
    options!['error-callback']('110200');

    expect(await pending).toBeNull();
    expect(warn).toHaveBeenCalledWith('Turnstile error', '110200');
  });

  it('si el widget no se pudo montar, no hace esperar: responde "sin token" al momento', async () => {
    vi.useFakeTimers();
    const widget = new TurnstileWidget();
    const mounting = widget.mount(document.createElement('div'), 'site-key', 100);
    const failed = expect(mounting).rejects.toThrow('turnstile');
    vi.advanceTimersByTime(100);
    await failed;

    expect(widget.failed).toBe(true);
    expect(await widget.next()).toBeNull();
  });
});
