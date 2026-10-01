import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { IndiceRadar } from '../../src/domain/types';
import MapaRadar from '../../src/ui/MapaRadar';

const PUNTO = { lat: 19.43, lon: -99.13 };
/** 03:06, 03:16 y 03:26 UTC = 21:06, 21:16 y 21:26 en CDMX. */
const BASE_S = Date.parse('2026-09-30T03:06:00Z') / 1000;

function indice(numFrames = 3): IndiceRadar {
  return {
    host: 'https://tilecache.rainviewer.com',
    generadoS: BASE_S,
    frames: Array.from({ length: numFrames }, (_, i) => ({
      tiempoS: BASE_S + i * 600,
      ruta: `/v2/radar/f${i}`,
    })),
  };
}

function urlsDeRadar(): string[] {
  return Array.from(document.querySelectorAll<HTMLImageElement>('.leaflet-tile-pane img'))
    .map((img) => img.src)
    .filter((src) => src.includes('/v2/radar/'));
}

describe('MapaRadar', () => {
  test('crea el mapa de Leaflet y muestra el fotograma más reciente', () => {
    render(<MapaRadar punto={PUNTO} nombre="CDMX" indice={indice()} timezone="America/Mexico_City" />);
    expect(document.querySelector('.leaflet-container')).not.toBeNull();
    expect(screen.getByTestId('hora-fotograma').textContent).toBe('21:26 h');
    expect(screen.getByText(/más reciente/)).toBeTruthy();
    const control = screen.getByLabelText('Fotograma del radar') as HTMLInputElement;
    expect(control.max).toBe('2');
    expect(control.value).toBe('2');
  });

  test('dibuja el marcador de la ubicación con su nombre', () => {
    render(<MapaRadar punto={PUNTO} nombre="CDMX" indice={indice()} timezone="America/Mexico_City" />);
    expect(document.querySelector('.leaflet-overlay-pane path')).not.toBeNull();
  });

  test('mover el control cambia de fotograma y ya no es el más reciente', () => {
    render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
    fireEvent.change(screen.getByLabelText('Fotograma del radar'), { target: { value: '0' } });
    expect(screen.getByTestId('hora-fotograma').textContent).toBe('21:06 h');
    expect(screen.queryByText(/más reciente/)).toBeNull();
  });

  test('pide los tiles de RainViewer con la paleta Universal Blue', () => {
    render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
    const urls = urlsDeRadar();
    // Leaflet no mide el contenedor en jsdom, pero sí llega a pedir al menos un tile.
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/tilecache\.rainviewer\.com\/v2\/radar\/f2\/256\/\d+\/\d+\/\d+\/2\/0_0\.png$/);
    }
  });

  describe('animación', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test('avanza un fotograma por paso, da la vuelta y se detiene al pausar', () => {
      render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
      const hora = () => screen.getByTestId('hora-fotograma').textContent;
      fireEvent.click(screen.getByRole('button', { name: 'Animar' }));
      expect(screen.getByRole('button', { name: 'Pausar' }).getAttribute('aria-pressed')).toBe('true');

      act(() => void vi.advanceTimersByTime(700));
      expect(hora()).toBe('21:06 h');
      act(() => void vi.advanceTimersByTime(700));
      expect(hora()).toBe('21:16 h');
      act(() => void vi.advanceTimersByTime(700));
      expect(hora()).toBe('21:26 h');

      fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
      act(() => void vi.advanceTimersByTime(2_000));
      expect(hora()).toBe('21:26 h');
    });

    test('mover el control a mano detiene la animación', () => {
      render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
      fireEvent.click(screen.getByRole('button', { name: 'Animar' }));
      fireEvent.change(screen.getByLabelText('Fotograma del radar'), { target: { value: '1' } });
      expect(screen.getByRole('button', { name: 'Animar' }).getAttribute('aria-pressed')).toBe('false');
      act(() => void vi.advanceTimersByTime(2_000));
      expect(screen.getByTestId('hora-fotograma').textContent).toBe('21:16 h');
    });
  });

  test('sin frames no dibuja nada', () => {
    const { container } = render(
      <MapaRadar punto={PUNTO} nombre={null} indice={indice(0)} timezone="America/Mexico_City" />,
    );
    expect(container.querySelector('section')).toBeNull();
  });

  test('al desmontar libera el mapa', () => {
    const { unmount } = render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
    unmount();
    expect(document.querySelector('.leaflet-container')).toBeNull();
  });

  test.each([[10, 'Hace 10 min'], [0, 'Hace 1 min']])(
    'la antigüedad a %s minutos usa el último fotograma: %s', (minutos, texto) => {
      const datos = indice();
      const ahoraMs = datos.frames[2].tiempoS * 1000 + minutos * 60_000;
      render(<MapaRadar punto={PUNTO} nombre={null} indice={datos}
        timezone="America/Mexico_City" ahoraMs={ahoraMs} />);
      expect(screen.getByText(texto)).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Fotograma del radar'), { target: { value: '0' } });
      expect(screen.getByText(texto)).toBeTruthy();
    },
  );

  test('el botón accesible cambia entre los íconos de reproducir y pausar', () => {
    render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
    const animar = screen.getByRole('button', { name: 'Animar' });
    expect(animar.getAttribute('aria-pressed')).toBe('false');
    expect(animar.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(animar.querySelector('path')?.getAttribute('d')).toBe('M8 5.5v13l10.5-6.5z');
    fireEvent.click(animar);
    const pausar = screen.getByRole('button', { name: 'Pausar' });
    expect(pausar.getAttribute('aria-pressed')).toBe('true');
    expect(pausar.querySelector('path')?.getAttribute('d')).toBe('M7 5h4v14H7zM13 5h4v14h-4z');
    fireEvent.click(pausar);
    expect(screen.getByRole('button', { name: 'Animar' }).getAttribute('aria-pressed')).toBe('false');
  });

  test('solo la base lleva la clase que permite el filtro oscuro', () => {
    render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
    expect(document.querySelector('.leaflet-tile-pane .mapa-radar__base')).not.toBeNull();
    const radar = [...document.querySelectorAll<HTMLImageElement>('.leaflet-tile-pane img')]
      .filter((tile) => tile.src.includes('/v2/radar/'));
    expect(radar.length).toBeGreaterThan(0);
    for (const tile of radar) {
      expect(tile.closest('.mapa-radar__base')).toBeNull();
    }
  });

  test('dibuja los tres marcadores con clases y deja la altura del mapa en CSS', () => {
    render(<MapaRadar punto={PUNTO} nombre={null} indice={indice()} timezone="America/Mexico_City" />);
    const mapa = screen.getByTestId('mapa-radar');
    expect(mapa.classList.contains('leaflet-container')).toBe(true);
    expect(mapa.style.height).toBe('');
    for (const clase of ['halo', 'borde', 'centro']) {
      expect(mapa.querySelectorAll(`.leaflet-overlay-pane path.mapa-radar__marcador-${clase}`))
        .toHaveLength(1);
    }
    expect(screen.getAllByRole('region', { name: 'Mapa de radar' })).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
