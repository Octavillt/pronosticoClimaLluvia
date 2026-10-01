import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { RadarEstado } from '../../src/ui/RadarEstado';

const casos = [
  {
    estado: { estado: 'sin-cobertura' } as const,
    etiqueta: 'Sin cobertura',
    mensaje: 'Tu zona está fuera del alcance del radar. La probabilidad usa solo el ensamble de modelos.',
  },
  {
    estado: { estado: 'desactualizado', edadMin: 54.6 } as const,
    etiqueta: 'Hace 55 min',
    mensaje: 'La imagen más reciente del radar es de hace 55 min y no se usa en el pronóstico.',
  },
];

describe('RadarEstado', () => {
  test.each(casos)('muestra la tarjeta $etiqueta con su explicación y mapa decorativo', (caso) => {
    render(<RadarEstado estado={caso.estado} />);
    const seccion = screen.getByRole('region', { name: 'Estado del radar' });
    expect(seccion.getAttribute('aria-label')).toBe('Estado del radar');
    expect(within(seccion).getByRole('heading', { level: 2, name: 'Radar' })).toBeTruthy();
    expect(within(seccion).getByText(caso.etiqueta).classList.contains('radar__antiguedad--neutra'))
      .toBe(true);
    expect(within(seccion).getByText(caso.mensaje).textContent).toBe(caso.mensaje);
    const svg = seccion.querySelector('.radar__ilustracion > svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 334 170');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.querySelectorAll('circle')).toHaveLength(3);
    expect(svg?.querySelectorAll('line')).toHaveLength(5);
    expect(svg?.querySelector('title, text')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByTestId('mapa-radar')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(seccion.textContent)
      .not.toMatch(/sin cobertura en esta zona|Radar RainViewer|hace 55 min y se ignora/);
  });
});
