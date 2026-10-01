import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { RadarEsqueleto } from '../../src/ui/RadarEsqueleto';

describe('RadarEsqueleto', () => {
  test('marca la tarjeta como ocupada sin añadir avisos de estado o alerta', () => {
    const { container } = render(<RadarEsqueleto />);
    const seccion = screen.getByRole('region', { name: 'Mapa de radar' });
    expect(seccion.getAttribute('aria-busy')).toBe('true');
    expect(seccion.classList.contains('tarjeta')).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: 'Radar' })).toBeTruthy();
    expect(container.querySelector('.radar__esqueleto')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('mapa-radar')).toBeNull();
  });
});
