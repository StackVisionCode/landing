import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

@Component({
  imports: [ModalComponent],
  template: `
    <button id="opener" type="button" (click)="open.set(true)">Open</button>
    <app-modal
      [isOpen]="open()"
      heading="Book a live demo"
      closeLabel="Close"
      (closed)="open.set(false)"
    >
      <button id="first" type="button">First</button>
      <button id="last" type="button">Last</button>
    </app-modal>
  `,
})
class HostComponent {
  readonly open = signal(false);
}

/** DEMO-08: el modal es un diálogo de verdad para el teclado y los lectores de pantalla. */
describe('ModalComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.style.overflow = '';
  });

  async function openModal() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { fixture, opener };
  }

  it('es un diálogo modal con su título enlazado y cierre traducido', async () => {
    const { fixture } = await openModal();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = fixture.nativeElement.querySelector(`#${dialog.getAttribute('aria-labelledby')}`);
    expect(title?.textContent).toBe('Book a live demo');
    expect(fixture.nativeElement.querySelector('button[aria-label="Close"]')).toBeTruthy();
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    fixture.nativeElement.remove();
  });

  it('con closeOnBackdrop apagado, un clic en el fondo no cierra', async () => {
    const fixture = TestBed.createComponent(ModalComponent);
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('closeOnBackdrop', false);
    fixture.detectChanges();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    (fixture.nativeElement.querySelector('.modal-backdrop') as HTMLElement).click();

    expect(closed).toBe(0);
  });

  it('el foco no sale del panel con Tab y Shift+Tab', async () => {
    const { fixture } = await openModal();
    const last = fixture.nativeElement.querySelector('#last') as HTMLButtonElement;
    const close = fixture.nativeElement.querySelector(
      'button[aria-label="Close"]',
    ) as HTMLButtonElement;

    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(close);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(last);
    fixture.nativeElement.remove();
  });

  it('Escape cierra, devuelve el foco al botón que lo abrió y libera el scroll', async () => {
    const { fixture, opener } = await openModal();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
    fixture.nativeElement.remove();
  });
});
