import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { resumirExactitud } from '../../src/services/verificacion';
import { Aprendizaje } from '../../src/ui/Aprendizaje';
import type { ProgresoAprendizaje } from '../../src/utils/aprendizaje';

const panel = {
  resumen: resumirExactitud([], [], Date.now()),
  disponible: true,
  exportar: vi.fn(),
  importar: vi.fn(),
  borrar: vi.fn(),
};
const sinDatos: ProgresoAprendizaje = {
  estado: 'sin-datos', n: 0, meta: 150, faltan: 150, fraccion: 0,
};
const casos: { progreso: ProgresoAprendizaje; texto: string; conDatos: boolean }[] = [
  {
    progreso: sinDatos,
    texto: 'Aún no hay horas verificadas. Con 150 en una misma franja horaria, ' +
      'el pronóstico se ajusta a tu zona.',
    conDatos: true,
  },
  {
    progreso: { estado: 'aprendiendo', n: 45, meta: 150, faltan: 105, fraccion: 0.3 },
    texto: 'Ya hay 45 de 150 horas verificadas en esta franja horaria. ' +
      'Faltan 105 para que el pronóstico se ajuste a tu zona.',
    conDatos: true,
  },
  {
    progreso: { estado: 'calibrado', n: 175, meta: 150, faltan: 0, fraccion: 1 },
    texto: 'El pronóstico ya se ajusta a tu zona con 175 horas verificadas en esta franja horaria.',
    conDatos: true,
  },
  {
    progreso: { ...sinDatos, estado: 'cargando' },
    texto: 'Leyendo tu historial local…',
    conDatos: false,
  },
  {
    progreso: { ...sinDatos, estado: 'sin-almacenamiento' },
    texto: 'Tu navegador no permite guardar el historial, así que el pronóstico no se ajusta a tu zona.',
    conDatos: false,
  },
];

describe('Aprendizaje', () => {
  test.each(casos)('el estado $progreso.estado muestra su texto y el progreso cuando corresponde', (caso) => {
    const { container } = render(<Aprendizaje progreso={caso.progreso} observaciones={3} panel={panel} />);
    expect(screen.getByText(caso.texto).textContent).toBe(caso.texto);
    const barra = screen.queryByRole('progressbar', { name: 'Horas verificadas en esta franja horaria' });
    if (caso.conDatos) {
      expect(barra).not.toBeNull();
      expect(barra?.getAttribute('aria-valuemin')).toBe('0');
      expect(barra?.getAttribute('aria-valuemax')).toBe(String(caso.progreso.meta));
      expect(barra?.getAttribute('aria-valuenow')).toBe(String(caso.progreso.n));
      const relleno = barra?.querySelector<HTMLElement>('.aprendizaje__relleno');
      expect(relleno?.style.getPropertyValue('--avance')).toBe(String(caso.progreso.fraccion));
      expect(screen.getByText(`${caso.progreso.n} de ${caso.progreso.meta}`)).toBeTruthy();
      expect(screen.getByText('3 observaciones guardadas')).toBeTruthy();
    } else {
      expect(barra).toBeNull();
      expect(container.querySelector('.aprendizaje__progreso')).toBeNull();
      expect(screen.queryByText(/observaciones guardadas/)).toBeNull();
    }
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(caso.texto)
      .not.toMatch(/Calibrada con tu historial local \(|Faltan \d+ pares|Cargando historial local/);
  });

  test.each([[1, '1 observación guardada'], [2, '2 observaciones guardadas']])(
    'el número de observaciones %s usa el texto %s', (observaciones, texto) => {
      render(<Aprendizaje progreso={sinDatos} observaciones={observaciones} panel={panel} />);
      expect(screen.getByText(texto)).toBeTruthy();
    },
  );

  test('abrir y cerrar el detalle conserva los contadores montados y no duplica la gestión', () => {
    const { container } = render(<Aprendizaje progreso={sinDatos} observaciones={0} panel={panel} />);
    const boton = screen.getByRole('button', { name: 'Ver detalle de exactitud' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(boton.getAttribute('aria-controls')).toBe('detalle-exactitud');
    const detalle = container.querySelector<HTMLDivElement>('#detalle-exactitud');
    const tarjeta = screen.getByRole('region', { name: 'Aprendizaje del pronóstico' });
    expect(detalle).not.toBeNull();
    expect(tarjeta.contains(detalle)).toBe(false);
    expect(tarjeta.nextElementSibling).toBe(detalle);
    expect(detalle?.hidden).toBe(true);
    expect(screen.queryByRole('region', { name: 'Panel de Exactitud' })).toBeNull();
    const contadores = ['observaciones', 'horas', 'insuficientes', 'pares']
      .map((nombre) => screen.getByTestId(`exactitud-${nombre}`));
    for (const contador of contadores) {
      expect(detalle?.contains(contador)).toBe(true);
      expect(contador.textContent).toBe('0');
    }
    fireEvent.click(boton);
    expect(screen.getByRole('button', { name: 'Ocultar detalle de exactitud' })).toBe(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(detalle?.hidden).toBe(false);
    expect(screen.getByRole('region', { name: 'Panel de Exactitud' })).toBeTruthy();
    expect(screen.queryByLabelText('Importar historial')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exportar historial' })).toBeNull();
    fireEvent.click(boton);
    expect(detalle?.hidden).toBe(true);
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    for (const contador of contadores) {
      expect(screen.getByTestId(contador.getAttribute('data-testid')!)).toBe(contador);
    }
  });
});
