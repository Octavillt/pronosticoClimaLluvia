import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { EstadoFuentes as Fuentes, EstadoRadar } from '../../src/domain/types';
import { EstadoFuentes } from '../../src/ui/EstadoFuentes';

const FUENTES: Fuentes = { ensamble: 'ok', modelosFallidos: [], complemento: 'ok', cache: 'miss' };
/** 03:26 UTC = 21:26 en CDMX. */
const T_FRAME = Date.parse('2026-09-30T03:26:00Z');

function radarLinea(radar: EstadoRadar | undefined): string | null {
  render(<EstadoFuentes fuentes={FUENTES} radar={radar} timezone="America/Mexico_City" />);
  return screen.queryByText(/Radar RainViewer/)?.textContent ?? null;
}

describe('EstadoFuentes', () => {
  test('sin información de radar no muestra esa línea', () => {
    expect(radarLinea(undefined)).toBeNull();
  });

  test('mientras consulta lo indica', () => {
    expect(radarLinea({ estado: 'cargando' })).toBe('Radar RainViewer: consultando…');
  });

  test('con datos muestra la hora local del frame y el avance de la lluvia', () => {
    const texto = radarLinea({ estado: 'ok', tFrameMs: T_FRAME, avance: { kmh: 34.6, haciaGrados: 92 } });
    expect(texto).toBe('Radar RainViewer: ✓ (imagen de las 21:26 h; la lluvia avanza a 35 km/h hacia el este)');
  });

  test('sin avance estimado omite esa parte', () => {
    const texto = radarLinea({ estado: 'ok', tFrameMs: T_FRAME, avance: null });
    expect(texto).toBe('Radar RainViewer: ✓ (imagen de las 21:26 h)');
  });

  test('sin cobertura avisa que solo se usa el ensamble', () => {
    expect(radarLinea({ estado: 'sin-cobertura' })).toMatch(/sin cobertura en esta zona \(solo ensamble\)/);
  });

  test('desactualizado indica la antigüedad de la imagen', () => {
    expect(radarLinea({ estado: 'desactualizado', edadMin: 54.6 })).toMatch(/hace 55 min y se ignora/);
  });

  test('con error avisa que no está disponible', () => {
    expect(radarLinea({ estado: 'error', mensaje: 'HTTP 503' })).toMatch(/no disponible \(solo ensamble\)/);
  });

  test('sigue mostrando ensamble, complemento y caché', () => {
    render(<EstadoFuentes fuentes={{ ...FUENTES, modelosFallidos: ['gem_global_ensemble'], ensamble: 'degradado', cache: 'hit' }} />);
    expect(screen.getByText(/Ensamble Open-Meteo: parcial \(sin gem_global_ensemble\)/)).toBeTruthy();
    expect(screen.getByText('Caché: reutilizado')).toBeTruthy();
  });
  test('conserva una única lista discreta con las líneas completas sin elementos hijos', () => {
    const { container } = render(<EstadoFuentes fuentes={FUENTES}
      radar={{ estado: 'ok', tFrameMs: T_FRAME, avance: null }} timezone="America/Mexico_City" />);
    const seccion = screen.getByRole('region', { name: 'Estado de fuentes' });
    expect(seccion.classList.contains('fuentes')).toBe(true);
    expect(seccion.classList.contains('tarjeta')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Fuentes' }).classList.contains('fuentes__titulo')).toBe(true);
    const listas = screen.getAllByRole('list');
    expect(listas).toHaveLength(1);
    expect(listas[0].tagName.toLowerCase()).toBe('ul');
    expect(listas[0].classList.contains('fuentes__lista')).toBe(true);
    expect(listas[0].querySelector('ul, ol')).toBeNull();
    const lineas = screen.getAllByRole('listitem');
    expect(lineas.map((linea) => linea.textContent)).toEqual([
      'Ensamble Open-Meteo: ✓',
      'Complemento horario: ✓',
      'Radar RainViewer: ✓ (imagen de las 21:26 h)',
      'Caché: consultado',
    ]);
    for (const linea of lineas) {
      expect(linea.children).toHaveLength(0);
    }
    expect(container.querySelector('[style]')).toBeNull();
  });
});
