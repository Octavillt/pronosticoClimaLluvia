import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AvisoActualizacion } from '../../src/ui/AvisoActualizacion';
import { AvisoSinConexion } from '../../src/ui/AvisoSinConexion';

describe('AvisoActualizacion', () => {
  test('muestra el texto exacto como status con su variante y el botón Actualizar', () => {
    const onActualizar = vi.fn();
    render(<AvisoActualizacion visible onActualizar={onActualizar} />);
    const aviso = screen.getByRole('status');
    expect(aviso.textContent).toBe('Hay una versión nueva de SistemaClima.Actualizar');
    expect(screen.getByText('Hay una versión nueva de SistemaClima.')).toBeTruthy();
    expect(aviso.classList.contains('aviso')).toBe(true);
    expect(aviso.classList.contains('aviso--actualizacion')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onActualizar).toHaveBeenCalledTimes(1);
  });

  test('sin versión nueva no dibuja nada', () => {
    const { container } = render(<AvisoActualizacion visible={false} onActualizar={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  test('no usa estilos en línea', () => {
    const { container } = render(<AvisoActualizacion visible onActualizar={vi.fn()} />);
    expect(container.querySelector('[style]')).toBeNull();
  });
});

describe('AvisoSinConexion', () => {
  test('muestra el texto exacto como status con su variante y un ícono decorativo', () => {
    const { container } = render(<AvisoSinConexion enLinea={false} />);
    const aviso = screen.getByRole('status');
    expect(aviso.textContent).toBe('Sin conexión. Puede que el pronóstico no esté actualizado.');
    expect(aviso.classList.contains('aviso--sin-conexion')).toBe(true);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[style]')).toBeNull();
  });

  test('con conexión no dibuja nada', () => {
    const { container } = render(<AvisoSinConexion enLinea />);
    expect(container.firstChild).toBeNull();
  });
});
