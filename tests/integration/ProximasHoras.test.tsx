import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import { ProximasHoras } from '../../src/ui/ProximasHoras';
import { MS_HORA } from '../../src/utils/horas';

const ahoraMs = Date.parse('2026-10-01T02:36:00Z');
const primerFinMs = Date.parse('2026-10-01T03:00:00Z');
const timezone = 'America/Mexico_City';

function serie(pop: number[], pesoRadar: number[] = [], desde = 0) {
  return {
    horasUtc: pop.map((_valor, i) => new Date(primerFinMs + i * MS_HORA).toISOString()),
    pop,
    pesoRadar,
    desde,
    ahoraMs,
    timezone,
  };
}

describe('ProximasHoras', () => {
  test('la lista tiene nombre accesible, foco y la primera píldora es Ahora', () => {
    render(<ProximasHoras {...serie([0.72, 0.46])} />);
    const lista = screen.getByRole('list', { name: 'Probabilidad de lluvia de las próximas horas' });
    expect(lista.getAttribute('tabindex')).toBe('0');
    const pildoras = within(lista).getAllByRole('listitem');
    expect(pildoras).toHaveLength(2);
    expect(pildoras[0].getAttribute('data-actual')).toBe('true');
    expect(within(pildoras[0]).getByText('Ahora')).toBeTruthy();
    expect(within(pildoras[0]).getByText('72%')).toBeTruthy();
    expect(pildoras[1].hasAttribute('data-actual')).toBe(false);
    expect(within(pildoras[1]).getByText('21:00')).toBeTruthy();
    expect(within(pildoras[1]).getByText('46%')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Próximas horas' })).toBeTruthy();
    expect(screen.getByText('Desliza ›').getAttribute('aria-hidden')).toBe('true');
    expect(lista.querySelector('ul, ol')).toBeNull();
    expect(lista.textContent).not.toContain('Ensamble Open-Meteo');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('con radar aparece solo cuando el peso supera estrictamente 0.05', () => {
    render(<ProximasHoras {...serie([0.46, 0.46, 0.46], [0.05, 0.0501])} />);
    const lista = screen.getByRole('list');
    const pildoras = within(lista).getAllByRole('listitem');
    expect(screen.getAllByText('con radar')).toHaveLength(1);
    expect(pildoras[0].querySelector('.pildora__radar')?.textContent).toBe('');
    expect(pildoras[1].querySelector('.pildora__radar')?.textContent).toBe('con radar');
    expect(pildoras[2].querySelector('.pildora__radar')?.textContent).toBe('');
    expect(screen.getByTestId('barra-pop-0').getAttribute('data-radar')).toBe('no');
    expect(screen.getByTestId('barra-pop-1').getAttribute('data-radar')).toBe('si');
    expect(screen.getByTestId('barra-pop-2').getAttribute('data-radar')).toBe('no');
  });

  test('el separador Mañana sigue la medianoche de CDMX y no consume índices de gotas', () => {
    render(<ProximasHoras {...serie([0.72, 0.46, 0.2, 0.1, 0.01, 0])} />);
    const lista = screen.getByRole('list');
    const pildoras = within(lista).getAllByRole('listitem');
    expect(pildoras).toHaveLength(7);
    expect(pildoras[4].textContent).toBe('Mañana');
    expect(pildoras[4].classList.contains('pildora--dia')).toBe(true);
    expect(pildoras[4].querySelector('svg')).toBeNull();
    expect(within(pildoras[5]).getByText('00:00')).toBeTruthy();
    const titulos = [
      '20:00 a 21:00 h: 72 %', '21:00 a 22:00 h: 46 %', '22:00 a 23:00 h: 20 %',
      '23:00 a 00:00 h: 10 %', '00:00 a 01:00 h: 1 %', '01:00 a 02:00 h: 0 %',
    ];
    titulos.forEach((titulo, i) => {
      const gota = screen.getByTestId(`barra-pop-${i}`);
      expect(gota.tagName.toLowerCase()).toBe('svg');
      expect(gota.firstElementChild?.tagName.toLowerCase()).toBe('title');
      expect(gota.firstElementChild?.textContent).toBe(titulo);
      expect(gota.querySelector('clipPath')?.id).toBe(`clip-gota-${i}`);
    });
    const ids = [...lista.querySelectorAll('clipPath')].map((recorte) => recorte.id);
    expect(new Set(ids).size).toBe(6);
    expect(within(pildoras[5]).getByTestId('barra-pop-4')).toBeTruthy();
  });

  test.each([[0.72, 32.4], [0.01, 1.5], [0, 1.5], [1, 45]])(
    'la gota con probabilidad %s tiene altura de relleno %s', (pop, altura) => {
      render(<ProximasHoras {...serie([pop])} />);
      const gota = screen.getByTestId('barra-pop-0');
      const rect = gota.querySelector('clipPath rect');
      expect(rect).not.toBeNull();
      expect(Number(rect?.getAttribute('height'))).toBeCloseTo(altura, 8);
      expect(Number(rect?.getAttribute('y'))).toBeCloseTo(48 - altura, 8);
      expect(rect?.getAttribute('x')).toBe('0');
      expect(rect?.getAttribute('width')).toBe('40');
      const trazos = gota.querySelectorAll('path');
      expect(trazos).toHaveLength(2);
      expect(trazos[0].getAttribute('d')).toBe(trazos[1].getAttribute('d'));
      expect(trazos[0].getAttribute('clip-path')).toBe('url(#clip-gota-0)');
    },
  );

  test('desde selecciona la hora original pero los testids siguen siendo relativos', () => {
    render(<ProximasHoras {...serie([0.72, 0.46, 0.2], [0, 0.1, 0], 1)} />);
    const gota = screen.getByTestId('barra-pop-0');
    expect(gota.querySelector('title')?.textContent).toBe('21:00 a 22:00 h: 46 %');
    expect(gota.getAttribute('data-radar')).toBe('si');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  test('limita las gotas a las horas configuradas aunque haya más datos', () => {
    const { container } = render(<ProximasHoras {...serie(Array.from({ length: 30 }, () => 0.46))} />);
    expect(container.querySelectorAll('[data-testid^="barra-pop-"]')).toHaveLength(config.ui.horasPildoras);
  });

  test.each([serie([]), { ...serie([0.5]), pop: [] }, serie([0.5], [], 1)])(
    'con una serie sin horas utilizables no renderiza contenido: %j', (props) => {
      const { container } = render(<ProximasHoras {...props} />);
      expect(container.innerHTML).toBe('');
      expect(screen.queryByRole('list')).toBeNull();
    },
  );
});
