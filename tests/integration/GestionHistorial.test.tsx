import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  borrarHistorial, importarHistorial, leerObservaciones, leerPredicciones,
} from '../../src/services/almacenVerificacion';
import { resumirExactitud } from '../../src/services/verificacion';
import { GestionHistorial } from '../../src/ui/GestionHistorial';
import { PanelExactitud } from '../../src/ui/PanelExactitud';
import { useVerificacion } from '../../src/ui/useVerificacion';
import { historialVerificacion, PUNTO_VERIFICACION } from '../helpers/verificacion';

function GestionConHistorial() {
  const estado = useVerificacion({
    punto: PUNTO_VERIFICACION,
    resultado: null,
    mezcla: null,
    nowcast: null,
    ahoraMs: Date.now(),
  });
  return <GestionHistorial {...estado} />;
}

async function esperarHistorial(): Promise<HTMLInputElement> {
  const archivo = screen.getByLabelText('Importar historial') as HTMLInputElement;
  await waitFor(() => expect(archivo.disabled).toBe(false));
  return archivo;
}

describe('GestionHistorial', () => {
  beforeEach(async () => { await borrarHistorial(); });

  test('ofrece los nombres accesibles completos y textos cortos con un input de archivo real', async () => {
    const { container } = render(<GestionConHistorial />);
    const input = await esperarHistorial();
    const exportar = screen.getByRole('button', { name: 'Exportar historial' });
    const borrar = screen.getByRole('button', { name: 'Borrar historial' });
    expect(exportar.textContent?.trim()).toBe('Exportar');
    expect(borrar.textContent?.trim()).toBe('Borrar');
    expect(input.tagName.toLowerCase()).toBe('input');
    expect(input.type).toBe('file');
    expect(input.accept).toBe('application/json,.json');
    expect(input.classList.contains('solo-lectores')).toBe(true);
    expect(input.labels?.[0].textContent?.trim()).toBe('Importar historial');
    expect(screen.getByText('Importar')).toBe(input.labels?.[0]);
    expect(screen.getByRole('region', { name: 'Tus datos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tus datos · solo en este dispositivo' })).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
    expect(container.querySelector('[style]')).toBeNull();
  });

  test('cancelar conserva el historial y confirmar borra con un único mensaje de estado', async () => {
    await importarHistorial(historialVerificacion(10));
    const { container } = render(<GestionConHistorial />);
    await esperarHistorial();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar historial' }));
    expect(container.querySelector('.datos__confirmacion')).not.toBeNull();
    expect(screen.getByText('¿Borrar todas las predicciones y observaciones de este navegador?'))
      .toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(container.querySelector('.datos__confirmacion')).toBeNull();
    expect(await leerPredicciones()).toHaveLength(10);
    expect(await leerObservaciones()).toHaveLength(30);
    fireEvent.click(screen.getByRole('button', { name: 'Borrar historial' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar borrado' });
    expect(confirmar.classList.contains('datos__peligro')).toBe(true);
    fireEvent.click(confirmar);
    expect((await screen.findByRole('status')).textContent).toBe('Historial borrado.');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(container.querySelector('.datos__confirmacion')).toBeNull();
    expect(await leerPredicciones()).toEqual([]);
    expect(await leerObservaciones()).toEqual([]);
  });

  test('un archivo inválido muestra el error JSON sin modificar el historial', async () => {
    await importarHistorial(historialVerificacion(10));
    render(<GestionConHistorial />);
    const input = await esperarHistorial();
    fireEvent.change(input, {
      target: { files: [new File(['no es JSON'], 'historial.json', { type: 'application/json' })] },
    });
    expect((await screen.findByRole('alert')).textContent).toBe('El archivo no es JSON válido.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(input.value).toBe('');
    expect(await leerPredicciones()).toHaveLength(10);
    expect(await leerObservaciones()).toHaveLength(30);
  });

  test('sin almacenamiento deshabilita botones y el input de importación', () => {
    render(<GestionHistorial resumen={null} disponible={false}
      exportar={vi.fn()} importar={vi.fn()} borrar={vi.fn()} />);
    const exportar = screen.getByRole('button', { name: 'Exportar historial' }) as HTMLButtonElement;
    const borrar = screen.getByRole('button', { name: 'Borrar historial' }) as HTMLButtonElement;
    expect(exportar.disabled).toBe(true);
    expect(borrar.disabled).toBe(true);
    expect((screen.getByLabelText('Importar historial') as HTMLInputElement).disabled).toBe(true);
  });

  test.each([false, undefined])('PanelExactitud respeta conGestion=%s', (conGestion) => {
    const resumen = resumirExactitud([], [], Date.now());
    render(<PanelExactitud resumen={resumen} disponible conGestion={conGestion}
      exportar={vi.fn()} importar={vi.fn()} borrar={vi.fn()} />);
    if (conGestion === false) {
      expect(screen.queryByLabelText('Importar historial')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Exportar historial' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Borrar historial' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Tus datos' })).toBeNull();
    } else {
      expect(screen.getByLabelText('Importar historial')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Exportar historial' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Borrar historial' })).toBeTruthy();
    }
  });
});
