import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { borrarHistorial, importarHistorial, leerObservaciones, leerPredicciones } from '../../src/services/almacenVerificacion';
import { resumirExactitud } from '../../src/services/verificacion';
import { PanelExactitud } from '../../src/ui/PanelExactitud';
import { useVerificacion } from '../../src/ui/useVerificacion';
import { historialVerificacion, PUNTO_VERIFICACION } from '../helpers/verificacion';

function PanelConHistorial() {
  const v = useVerificacion({ punto: PUNTO_VERIFICACION, resultado: null, mezcla: null, nowcast: null, ahoraMs: Date.now() });
  return <PanelExactitud {...v} />;
}

async function cargarArchivo(texto: string) {
  fireEvent.change(screen.getByLabelText('Importar historial'), { target: { files: [new File([texto], 'historial.json', { type: 'application/json' })] } });
}

describe('PanelExactitud', () => {
  beforeEach(async () => { await borrarHistorial(); });
  afterEach(() => vi.restoreAllMocks());

  test('estado vacío y explicación de las horas insuficientes', async () => {
    render(<PanelConHistorial />);
    expect(await screen.findByText(/Aún no hay pares verificados\. Registra/)).toBeTruthy();
    expect(screen.getByTestId('exactitud-observaciones').textContent).toBe('0');
    expect(screen.getByText(/al menos 3 ventanas distintas de 10 min/)).toBeTruthy();
  });

  test('con datos muestra métricas, horizontes calibrados y diagrama con tabla accesible', async () => {
    await importarHistorial(historialVerificacion());
    render(<PanelConHistorial />);
    expect(await screen.findByText('Calibrado')).toBeTruthy();
    expect(screen.getByTestId('exactitud-horas').textContent).toBe('150');
    expect(screen.getByText(/peor que decir siempre 10 %/)).toBeTruthy();
    expect(screen.getByText(/Brier con radar/)).toBeTruthy();
    const diagrama = screen.getByRole('img', { name: /Confiabilidad/ });
    expect(diagrama.querySelectorAll('circle')).toHaveLength(1);
    expect(diagrama.querySelector('circle title')?.textContent).toMatch(/150 pares/);
    expect(screen.getByRole('table', { name: 'Datos de confiabilidad' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Resultados por horizonte' })).getByText('0–1 h')).toBeTruthy();
  });

  test('avisa que la muestra global y la del radar aún no son concluyentes', async () => {
    await importarHistorial(historialVerificacion(10));
    render(<PanelConHistorial />);
    expect(await screen.findByText(/La muestra es pequeña/)).toBeTruthy();
    expect(screen.getByText(/La muestra del radar es pequeña/)).toBeTruthy();
    expect(screen.getByText('Faltan 140 pares')).toBeTruthy();
  });

  test('exportar descarga el JSON esperado y revoca la URL temporal', async () => {
    const historial = historialVerificacion(10);
    const resumen = resumirExactitud(historial.predicciones, historial.observaciones, Date.now());
    let blob: Blob | undefined;
    let nombre = '';
    const crear = vi.fn((b: Blob) => { blob = b; return 'blob:historial'; });
    const revocar = vi.fn();
    const crearAnterior = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revocarAnterior = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: crear });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revocar });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });
    try {
      render(<PanelExactitud disponible resumen={resumen} exportar={async () => JSON.stringify(historial)} importar={vi.fn()} borrar={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Exportar historial' }));
      await screen.findByText('Historial exportado.');
      expect(nombre).toBe(`sistemaclima-verificacion-${new Date().toISOString().slice(0, 10)}.json`);
      expect(blob?.type).toBe('application/json');
      const texto = await new Promise<string>((resolve) => { const lector = new FileReader(); lector.onload = () => resolve(String(lector.result)); lector.readAsText(blob!); });
      expect(JSON.parse(texto)).toEqual(historial);
      await waitFor(() => expect(revocar).toHaveBeenCalledWith('blob:historial'));
    } finally {
      if (crearAnterior) Object.defineProperty(URL, 'createObjectURL', crearAnterior); else Reflect.deleteProperty(URL, 'createObjectURL');
      if (revocarAnterior) Object.defineProperty(URL, 'revokeObjectURL', revocarAnterior); else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  test('importación válida actualiza contadores y anuncia los registros nuevos', async () => {
    render(<PanelConHistorial />);
    await screen.findByTestId('exactitud-observaciones');
    await cargarArchivo(JSON.stringify(historialVerificacion(10)));
    expect(await screen.findByText('Se agregaron 10 predicciones y 30 observaciones.')).toBeTruthy();
    expect(screen.getByTestId('exactitud-observaciones').textContent).toBe('30');
    expect(await leerPredicciones()).toHaveLength(10);
  });

  test.each(['no es JSON', JSON.stringify({ formato: 'incorrecto' })])('importación inválida (%s) muestra error sin cambiar datos', async (texto) => {
    await importarHistorial(historialVerificacion(10));
    render(<PanelConHistorial />);
    await screen.findByTestId('exactitud-observaciones');
    await cargarArchivo(texto);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByTestId('exactitud-observaciones').textContent).toBe('30');
    expect(await leerObservaciones()).toHaveLength(30);
    expect(await leerPredicciones()).toHaveLength(10);
  });

  test('borrado en dos pasos: cancelar conserva y confirmar elimina', async () => {
    await importarHistorial(historialVerificacion(10));
    render(<PanelConHistorial />);
    await screen.findByTestId('exactitud-observaciones');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar historial' }));
    expect(await leerObservaciones()).toHaveLength(30);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Confirmar borrado' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar historial' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado' }));
    await screen.findByText('Historial borrado.');
    expect(screen.getByTestId('exactitud-observaciones').textContent).toBe('0');
    expect(await leerObservaciones()).toEqual([]);
    expect(await leerPredicciones()).toEqual([]);
  });

  test('sin almacenamiento explica la degradación y deshabilita las operaciones', () => {
    render(<PanelExactitud disponible={false} resumen={null} exportar={vi.fn()} importar={vi.fn()} borrar={vi.fn()} />);
    expect(screen.getByText(/pronóstico sigue funcionando sin historial/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Exportar historial' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Importar historial') as HTMLInputElement).disabled).toBe(true);
  });
});
