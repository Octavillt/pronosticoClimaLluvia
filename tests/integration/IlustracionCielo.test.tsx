import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { IlustracionCielo } from '../../src/ui/IlustracionCielo';
import type { NivelLluvia } from '../../src/utils/lluvia';

const casos: { nivel: NivelLluvia; lineas: number; nubes: number; soles: number }[] = [
  { nivel: 'alta', lineas: 8, nubes: 2, soles: 0 },
  { nivel: 'media', lineas: 3, nubes: 2, soles: 0 },
  { nivel: 'baja', lineas: 0, nubes: 1, soles: 1 },
  { nivel: 'nula', lineas: 0, nubes: 0, soles: 1 },
];

describe('IlustracionCielo', () => {
  test.each(casos)('el nivel $nivel contiene sus formas y es decoración inaccesible al foco', (caso) => {
    const { container } = render(<IlustracionCielo nivel={caso.nivel} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('data-nivel')).toBe(caso.nivel);
    expect(svg?.getAttribute('viewBox')).toBe('0 0 390 260');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMaxYMin meet');
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelectorAll('.ilustracion__lluvia line')).toHaveLength(caso.lineas);
    expect(container.querySelectorAll('line')).toHaveLength(caso.lineas);
    const nubes = container.querySelectorAll('g.ilustracion__nube-lejana, g.ilustracion__nube-clara');
    expect(nubes).toHaveLength(caso.nubes);
    expect(container.querySelectorAll('circle.ilustracion__sol')).toHaveLength(caso.soles);
    expect(container.querySelectorAll('circle.ilustracion__halo')).toHaveLength(caso.soles);
    if (caso.nivel === 'alta' || caso.nivel === 'media') {
      for (const nube of nubes) {
        expect(nube.getAttribute('fill-opacity')).toBe(caso.nivel === 'alta' ? '1' : '0.95');
      }
      const lluvia = container.querySelector('.ilustracion__lluvia');
      expect(lluvia?.getAttribute('stroke-opacity')).toBe('0.7');
      expect(lluvia?.getAttribute('stroke-width')).toBe('2.5');
      expect(lluvia?.getAttribute('stroke-linecap')).toBe('round');
    } else {
      const halo = container.querySelector('.ilustracion__halo');
      expect(halo?.getAttribute('fill-opacity')).toBe(caso.nivel === 'baja' ? '0.18' : '0.2');
    }
  });

  test.each(casos)('el nivel $nivel no añade texto, efectos, recursos ni colores en línea', ({ nivel }) => {
    const { container } = render(<IlustracionCielo nivel={nivel} />);
    expect(container.querySelectorAll('filter, title, text, linearGradient, radialGradient, image'))
      .toHaveLength(0);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
    for (const elemento of container.querySelectorAll('*')) {
      for (const atributo of ['fill', 'stroke']) {
        expect(elemento.getAttribute(atributo), `nivel ${nivel}, atributo ${atributo}`)
          .toBeNull();
      }
    }
    expect(container.textContent).toBe('');
  });
});
