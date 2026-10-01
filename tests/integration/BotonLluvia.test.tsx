import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { borrarHistorial, leerObservaciones } from '../../src/services/almacenVerificacion';
import { BotonLluvia } from '../../src/ui/BotonLluvia';
import { useVerificacion } from '../../src/ui/useVerificacion';
import { PUNTO_VERIFICACION } from '../helpers/verificacion';

function BotonConHistorial() {
  const v = useVerificacion({
    punto: PUNTO_VERIFICACION,
    resultado: null,
    mezcla: null,
    nowcast: null,
    ahoraMs: Date.now(),
  });
  return (
    <BotonLluvia
      disponible={v.disponible}
      cargando={!v.resumen}
      lugar={null}
      registrarObservacionUsuario={v.registrarObservacionUsuario}
    />
  );
}

describe('BotonLluvia', () => {
  beforeEach(async () => { await borrarHistorial(); });

  test.each([['Sí, está lloviendo', true], ['No está lloviendo', false]] as const)(
    '%s guarda una observación del usuario y confirma',
    async (nombre, lluvia) => {
      render(<BotonConHistorial />);
      const boton = screen.getByRole('button', { name: nombre }) as HTMLButtonElement;
      await waitFor(() => expect(boton.disabled).toBe(false));
      const antes = Date.now();
      fireEvent.click(boton);
      expect((await screen.findByRole('status')).textContent).toBe('Gracias, registrado.');
      const observaciones = await leerObservaciones();
      expect(observaciones).toHaveLength(1);
      expect(observaciones[0].fuente).toBe('usuario');
      expect(observaciones[0].lluvia).toBe(lluvia);
      expect(observaciones[0].tMs).toBeGreaterThanOrEqual(antes);
    },
  );

  test('sin almacenamiento deshabilita los botones y explica el motivo', () => {
    const registrar = vi.fn();
    render(<BotonLluvia disponible={false} lugar={null} registrarObservacionUsuario={registrar} />);
    expect(screen.getByText(/almacenamiento local no está disponible/)).toBeTruthy();
    for (const boton of screen.getAllByRole('button')) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Sí, está lloviendo' }));
    expect(registrar).not.toHaveBeenCalled();
  });

  test('un registro fallido muestra el error y no confirma éxito', async () => {
    render(
      <BotonLluvia
        disponible
        lugar={null}
        registrarObservacionUsuario={async () => { throw new Error('Sin cuota'); }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sí, está lloviendo' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No se pudo registrar/);
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('un registro omitido muestra un estado neutro y no confirma éxito', async () => {
    render(<BotonLluvia disponible lugar={null} registrarObservacionUsuario={async () => false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, está lloviendo' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'No se registró: ya hay una observación en este instante o el historial aún no está listo.',
    );
    expect(screen.queryByText('Gracias, registrado.')).toBeNull();
  });
  test.each([null, 'Guadalajara'])('el subtítulo corresponde al lugar %s', (lugar) => {
    render(<BotonLluvia disponible lugar={lugar} registrarObservacionUsuario={async () => true} />);
    const mensajeCiudad = 'Reporta solo lo que ves donde estás: ' +
      'estos reportes calibran el pronóstico de este lugar.';
    const mensajeDispositivo = 'Tus respuestas hacen más exacto el pronóstico aquí.';
    expect(screen.getByRole('heading', {
      name: lugar === null ? '¿Está lloviendo?' : `¿Está lloviendo en ${lugar}?`,
    })).toBeTruthy();
    if (lugar === null) {
      expect(screen.getByText(mensajeDispositivo)).toBeTruthy();
      expect(screen.queryByText(/Reporta solo lo que ves donde estás/)).toBeNull();
    } else {
      expect(screen.getByText(mensajeCiudad)).toBeTruthy();
      expect(screen.queryByText(mensajeDispositivo)).toBeNull();
    }
  });

  test('los botones usan las variantes visuales y se deshabilitan sin almacenamiento', () => {
    const registrar = vi.fn(async () => true);
    const { container, rerender } = render(
      <BotonLluvia disponible lugar={null} registrarObservacionUsuario={registrar} />,
    );
    const si = screen.getByRole('button', { name: 'Sí, está lloviendo' }) as HTMLButtonElement;
    const no = screen.getByRole('button', { name: 'No está lloviendo' }) as HTMLButtonElement;
    expect(si.classList.contains('boton')).toBe(true);
    expect(si.classList.contains('boton--primario')).toBe(true);
    expect(no.classList.contains('boton')).toBe(true);
    expect(no.classList.contains('boton--secundario')).toBe(true);
    expect(si.disabled).toBe(false);
    expect(no.disabled).toBe(false);
    expect(container.querySelector('section')?.classList.contains('tarjeta')).toBe(true);
    expect(container.querySelector('[style]')).toBeNull();
    rerender(<BotonLluvia disponible={false} lugar={null} registrarObservacionUsuario={registrar} />);
    expect(si.disabled).toBe(true);
    expect(no.disabled).toBe(true);
    fireEvent.click(si);
    fireEvent.click(no);
    expect(registrar).not.toHaveBeenCalled();
  });
});
