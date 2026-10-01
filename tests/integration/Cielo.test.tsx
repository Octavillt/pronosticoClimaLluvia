import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Cielo } from '../../src/ui/Cielo';
import type { ResumenCielo } from '../../src/utils/mensajeCielo';

const punto = { lat: 19.43, lon: -99.13 };
const resumenAlta: ResumenCielo = {
  porcentaje: 72,
  nivel: 'alta',
  accion: 'Lleva paraguas.',
  frase: 'Baja a menos de 10\u00a0% desde las 22:00.',
  etiquetaHora: 'Ahora · 20:00 a 21:00 h',
  conRadar: true,
  chipRadar: { texto: 'Radar: avanza a 28\u00a0km/h al este', tono: 'ok' },
  vencido: false,
};
const resumenes: ResumenCielo[] = [
  resumenAlta,
  {
    ...resumenAlta,
    porcentaje: 45,
    nivel: 'media',
    accion: 'Posible lluvia: ten un paraguas a la mano.',
    frase: 'Baja a menos de 10\u00a0% desde las 23:00.',
    chipRadar: { texto: 'Radar: imagen de las 19:58 h', tono: 'ok' },
  },
  {
    ...resumenAlta,
    porcentaje: 15,
    nivel: 'baja',
    accion: 'Poco probable que llueva.',
    frase: 'La probabilidad sube a 45\u00a0% desde las 17:00 de mañana.',
    conRadar: false,
    chipRadar: { texto: 'Radar: sin cobertura aquí', tono: 'aviso' },
  },
  {
    ...resumenAlta,
    porcentaje: 3,
    nivel: 'nula',
    accion: 'No se espera lluvia.',
    frase: 'Se mantiene seco las próximas 24 horas.',
    conRadar: false,
    chipRadar: { texto: 'Radar: consultando…', tono: 'neutro' },
  },
];

describe('Cielo', () => {
  test.each(resumenes)('muestra el resumen del nivel $nivel y conserva los contratos', (resumen) => {
    const { container } = render(
      <Cielo punto={punto} nombre={null} resumen={resumen} horasVerificadas={null} onCambiar={vi.fn()} />,
    );
    expect(container.querySelector('header')?.getAttribute('data-nivel')).toBe(resumen.nivel);
    const numero = screen.getByTestId('pop-ahora');
    expect(numero.textContent).toBe(`${resumen.porcentaje}%`);
    expect([...numero.children].map((hijo) => hijo.textContent)).toEqual([`${resumen.porcentaje}`, '%']);
    expect(screen.getByText(resumen.accion, { exact: true })).toBeTruthy();
    expect(screen.getByText(resumen.frase!, { exact: true, normalizer: (texto) => texto.trim() }))
      .toBeTruthy();
    expect(screen.getByText(resumen.etiquetaHora, { exact: true })).toBeTruthy();
    const pronostico = screen.getByRole('region', { name: 'Probabilidad de lluvia actual' });
    expect(pronostico.textContent).toContain('20:00 a 21:00 h');
    expect(pronostico.textContent).not.toMatch(/02:00|03:00/);
    const chip = screen.getByText(resumen.chipRadar.texto,
      { exact: true, normalizer: (texto) => texto.trim() });
    expect(chip.getAttribute('data-tono')).toBe(resumen.chipRadar.tono);
    expect(screen.getByTestId('origen-pop').textContent).toBe(resumen.conRadar
      ? 'Combina el radar con el ensamble de modelos.' : 'Basada en el ensamble de modelos.');
    expect(screen.queryByTestId('aviso-calibracion')).toBeNull();
    expect(screen.getByText('Tu ubicación', { exact: true })).toBeTruthy();
    expect(screen.getByText('19.43, −99.13', { exact: true })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1, name: 'SistemaClima' })).toHaveLength(1);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
    const ilustracion = container.querySelector('header > svg.cielo__ilustracion');
    expect(ilustracion).not.toBeNull();
    expect(container.querySelector('header')?.firstElementChild).toBe(ilustracion);
    expect(ilustracion?.getAttribute('aria-hidden')).toBe('true');
    expect(ilustracion?.getAttribute('focusable')).toBe('false');
    expect(ilustracion?.getAttribute('data-nivel')).toBe(resumen.nivel);
    expect(screen.queryByRole('img')).toBeNull();
  });

  test.each([0, 150])('muestra una sola calibración con %s horas verificadas', (horas) => {
    render(<Cielo punto={punto} nombre={null} resumen={resumenAlta}
      horasVerificadas={horas} onCambiar={vi.fn()} />);
    const texto = `Calibrada con tu historial local (${horas} horas verificadas)`;
    expect(screen.getByTestId('aviso-calibracion').textContent).toBe(texto);
    expect(screen.getAllByText(texto, { exact: true })).toHaveLength(1);
  });

  test('muestra el nombre buscado como texto exacto único y Cambiar llama al controlador', () => {
    const cambiar = vi.fn();
    render(<Cielo punto={punto} nombre="Guadalajara" resumen={resumenAlta}
      horasVerificadas={null} onCambiar={cambiar} />);
    expect(screen.getAllByText('Guadalajara', { exact: true })).toHaveLength(1);
    expect(screen.queryByText(/Tu ubicación/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(cambiar).toHaveBeenCalledTimes(1);
  });

  test('omite la frase cuando el resumen no tiene tendencia', () => {
    const { container } = render(<Cielo punto={punto} nombre={null}
      resumen={{ ...resumenAlta, frase: null }} horasVerificadas={null} onCambiar={vi.fn()} />);
    expect(container.querySelector('.cielo__frase')).toBeNull();
    expect(screen.getByText(resumenAlta.accion)).toBeTruthy();
  });

  test('el pronóstico vencido conserva número, radar y calibración y muestra cómo actualizarlo', () => {
    const vencido: ResumenCielo = {
      ...resumenAlta, vencido: true, etiquetaHora: '', accion: '', frase: null, conRadar: false,
    };
    const { container } = render(<Cielo punto={punto} nombre={null} resumen={vencido}
      horasVerificadas={150} onCambiar={vi.fn()} />);
    expect(screen.getByText('Este pronóstico ya venció. Recarga la página para actualizarlo.'))
      .toBeTruthy();
    expect(container.querySelector('.cielo__hora')).toBeNull();
    expect(container.querySelector('.cielo__frase')).toBeNull();
    expect(screen.getByTestId('pop-ahora').textContent).toBe('72%');
    expect(screen.getByText(vencido.chipRadar.texto, { normalizer: (texto) => texto.trim() })).toBeTruthy();
    expect(screen.getByTestId('aviso-calibracion').textContent)
      .toBe('Calibrada con tu historial local (150 horas verificadas)');
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
