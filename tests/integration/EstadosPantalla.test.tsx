import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buscarCiudad } from '../../src/providers/geocoding';
import { BuscadorCiudad } from '../../src/ui/BuscadorCiudad';
import { Encabezado } from '../../src/ui/Encabezado';
import { ErrorPronostico } from '../../src/ui/ErrorPronostico';
import { EsqueletoCielo } from '../../src/ui/EsqueletoCielo';
import { SinUbicacion } from '../../src/ui/SinUbicacion';

vi.mock('../../src/providers/geocoding', () => ({ buscarCiudad: vi.fn() }));

const GUADALAJARA = { nombre: 'Guadalajara', estado: 'Jalisco', lat: 20.67, lon: -103.35 };
const SIN_ESTADO = { nombre: 'Atlantis', estado: '', lat: 20, lon: -100 };

beforeEach(() => {
  vi.mocked(buscarCiudad).mockReset();
});

describe('Encabezado', () => {
  test('muestra la marca con un único h1 y el ícono decorativo', () => {
    const { container } = render(<Encabezado />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'SistemaClima' })).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('EsqueletoCielo', () => {
  test('es un bloque ocupado con la marca real, un único status y relleno decorativo', () => {
    const { container } = render(<EsqueletoCielo />);
    expect(container.querySelector('header')?.getAttribute('aria-busy')).toBe('true');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'SistemaClima' })).toBeTruthy();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Obteniendo pronóstico…');
    expect(screen.queryByRole('alert')).toBeNull();
    const relleno = container.querySelectorAll('[aria-hidden="true"]');
    expect(relleno.length).toBeGreaterThanOrEqual(3);
  });

  test('dibuja cinco píldoras de relleno', () => {
    const { container } = render(<EsqueletoCielo />);
    expect(container.querySelectorAll('.esqueleto__pildora')).toHaveLength(5);
  });
});

describe('SinUbicacion', () => {
  function pantalla(parcial: Partial<Parameters<typeof SinUbicacion>[0]> = {}) {
    const props = {
      fueraDeMexico: false,
      ubicacionFallida: false,
      onUsarUbicacion: vi.fn(),
      onElegir: vi.fn(),
      ...parcial,
    };
    render(<SinUbicacion {...props} />);
    return props;
  }

  test('fuera de México muestra su alerta única con el título y el detalle', () => {
    pantalla({ fueraDeMexico: true });
    const alerta = screen.getByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(alerta.textContent).toMatch(/fuera de México/);
    expect(alerta.textContent).toMatch(/Elige una ciudad mexicana\./);
    expect(screen.queryByText(/No pudimos obtener tu ubicación/)).toBeNull();
  });

  test('con la ubicación fallida explica qué hacer y no usa alerta', () => {
    pantalla({ ubicacionFallida: true });
    expect(screen.getByText(
      'No pudimos obtener tu ubicación. Busca tu ciudad o vuelve a intentarlo.',
    )).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('sin fallo (p. ej. tras Cambiar) no muestra ese texto ni alerta', () => {
    pantalla();
    expect(screen.queryByText(/No pudimos obtener tu ubicación/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Busca tu ciudad' })).toBeTruthy();
  });

  test('Usar mi ubicación llama a su acción y el buscador viene incluido', () => {
    const props = pantalla();
    fireEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación' }));
    expect(props.onUsarUbicacion).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Nombre de la ciudad')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeTruthy();
  });
});

describe('ErrorPronostico', () => {
  test('muestra el título, la causa con la sugerencia y reintenta', () => {
    const onReintentar = vi.fn();
    render(<ErrorPronostico mensaje="Failed to fetch" onReintentar={onReintentar} />);
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toMatch(/No se pudo obtener el pronóstico/);
    expect(alerta.textContent).toMatch(/Failed to fetch\. Revisa tu conexión e inténtalo de nuevo\./);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  test('no duplica el punto final de la causa', () => {
    render(<ErrorPronostico mensaje="No se pudo obtener el ensamble. " onReintentar={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'No se pudo obtener el ensamble. Revisa tu conexión',
    );
    expect(screen.getByRole('alert').textContent).not.toContain('..');
  });

  test('sin mensaje solo muestra la sugerencia', () => {
    render(<ErrorPronostico mensaje="" onReintentar={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('Revisa tu conexión e inténtalo de nuevo.');
    expect(screen.getByRole('alert').textContent).not.toMatch(/^\s*\./);
  });
});

describe('BuscadorCiudad', () => {
  test('busca, lista los resultados con su estado y elige uno', async () => {
    vi.mocked(buscarCiudad).mockResolvedValue([GUADALAJARA, SIN_ESTADO]);
    const onElegir = vi.fn();
    render(<BuscadorCiudad onElegir={onElegir} />);
    fireEvent.change(screen.getByLabelText('Nombre de la ciudad'), { target: { value: 'Guad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    const resultado = await screen.findByRole('button', { name: 'Guadalajara, Jalisco' });
    expect(screen.getByRole('button', { name: 'Atlantis' })).toBeTruthy();
    expect(screen.queryByText('Guadalajara', { exact: true })).toBeNull();
    fireEvent.click(resultado);
    expect(onElegir).toHaveBeenCalledWith({ lat: 20.67, lon: -103.35 }, 'Guadalajara');
  });

  test('sin resultados avisa con un alert y sin conexión también', async () => {
    vi.mocked(buscarCiudad).mockResolvedValueOnce([]);
    render(<BuscadorCiudad onElegir={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nombre de la ciudad'), { target: { value: 'Zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Sin resultados en México');

    vi.mocked(buscarCiudad).mockRejectedValueOnce(new Error('red'));
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No se pudo buscar. Intenta de nuevo.'),
    );
  });

  test('el botón cambia a Buscando… mientras espera y el campo conserva su placeholder', async () => {
    let terminar: (ciudades: typeof GUADALAJARA[]) => void = () => undefined;
    vi.mocked(buscarCiudad).mockReturnValue(new Promise((resolver) => { terminar = resolver; }));
    render(<BuscadorCiudad onElegir={vi.fn()} />);
    expect(screen.getByPlaceholderText('Ej. Guadalajara')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nombre de la ciudad'), { target: { value: 'Guad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const ocupado = await screen.findByRole('button', { name: 'Buscando…' }) as HTMLButtonElement;
    expect(ocupado.disabled).toBe(true);
    terminar([GUADALAJARA]);
    expect(await screen.findByRole('button', { name: 'Guadalajara, Jalisco' })).toBeTruthy();
  });

  test('el chevrón de cada resultado es decorativo y la lista no usa colores en línea', async () => {
    vi.mocked(buscarCiudad).mockResolvedValue([GUADALAJARA]);
    const { container } = render(<BuscadorCiudad onElegir={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nombre de la ciudad'), { target: { value: 'Guad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByRole('button', { name: 'Guadalajara, Jalisco' });
    expect(container.querySelector('.buscador__resultado svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[style]')).toBeNull();
  });
});
