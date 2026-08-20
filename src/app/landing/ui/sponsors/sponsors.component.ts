import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';

interface Sponsor {
  name: string;
  description: string;
  logo: string;
}

const SPONSORS: Sponsor[] = [
  {
    name: 'Crecer Connect',
    description: 'Conectamos tu crecimiento financiero con soluciones innovadoras y accesibles para todos.',
    logo: '/marcas/CrecerConnectLogo_Border.png',
  },
  {
    name: 'Pathward',
    description: 'Partner bancario líder en soluciones financieras modernas y servicios de pago integrados.',
    logo: '/marcas/pathward_logo.png',
  },
];

const ROTATE_INTERVAL_MS = 4000;

@Component({
  selector: 'app-sponsors',
  templateUrl: './sponsors.component.html',
})
export class SponsorsComponent {
  protected readonly sponsors = SPONSORS;
  protected readonly currentIndex = signal(0);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.startRotation();
      destroyRef.onDestroy(() => this.stopRotation());
    });
  }

  startRotation(): void {
    this.stopRotation();
    this.intervalId = setInterval(() => {
      this.currentIndex.update((i) => (i + 1) % this.sponsors.length);
    }, ROTATE_INTERVAL_MS);
  }

  stopRotation(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
