import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GeoPoint,
  Nowcast,
  Observacion,
  Prediccion,
  ResultadoPronostico,
} from '../domain/types';
import {
  borrarHistorial,
  exportarHistorial,
  guardarObservaciones,
  guardarPredicciones,
  importarHistorial,
  purgarAntiguos,
  validarHistorial,
} from '../services/almacenVerificacion';
import type { ResultadoMezcla } from '../services/blend';
import { SIN_CALIBRACION, type Calibracion } from '../services/calibracion';
import { geohashEncode } from '../services/geohash';
import {
  calibracionDesde,
  cargarHistorial,
  observacionDeUsuario,
  observacionesDeRadar,
  type Historial,
} from '../services/registroVerificacion';
import { crearPredicciones, resumirExactitud, type ResumenExactitud } from '../services/verificacion';

export interface EntradaVerificacion {
  punto: GeoPoint | null;
  resultado: Extract<ResultadoPronostico, { tipo: 'ok' }> | null;
  mezcla: ResultadoMezcla | null;
  nowcast: Nowcast | null;
  ahoraMs: number;
}

export interface EstadoVerificacion {
  /** false si IndexedDB no se pudo usar: la app sigue sin registro ni calibración. */
  disponible: boolean;
  calibracion: Calibracion;
  resumen: ResumenExactitud | null;
  registrarObservacionUsuario: (lluvia: boolean, tMs?: number) => Promise<boolean>;
  /** Historial completo como texto JSON, listo para descargar. */
  exportar: () => Promise<string>;
  importar: (datos: unknown) => Promise<{ predicciones: number; observaciones: number }>;
  borrar: () => Promise<void>;
}

/** Une por id conservando lo que ya estaba (en predicciones la primera emisión es la que vale). */
function unirPorId<T extends { id: string }>(existentes: T[], nuevos: T[]): T[] {
  const ids = new Set(existentes.map((r) => r.id));
  return [...existentes, ...nuevos.filter((r) => {
    if (ids.has(r.id)) {
      return false;
    }
    ids.add(r.id);
    return true;
  })];
}

// El reloj reintenta las bandas de horizonte; el Set evita repetir escrituras por minuto.
export function useVerificacion({
  punto,
  resultado,
  mezcla,
  nowcast,
  ahoraMs,
}: EntradaVerificacion): EstadoVerificacion {
  const [disponible, setDisponible] = useState(true);
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [calibracion, setCalibracion] = useState<Calibracion>(SIN_CALIBRACION);
  const [resumen, setResumen] = useState<ResumenExactitud | null>(null);
  const registrados = useRef(new Set<string>());
  const historialActual = useRef<Historial | null>(null);
  const disponibleActual = useRef(true);

  const degradar = useCallback(() => {
    disponibleActual.current = false;
    setDisponible(false);
    setCalibracion(SIN_CALIBRACION);
    setResumen(null);
  }, []);

  const actualizarHistorial = useCallback((h: Historial) => {
    historialActual.current = h;
    setHistorial(h);
  }, []);

  const recalcular = useCallback((h: Historial, ahora: number) => {
    setCalibracion(calibracionDesde(h.predicciones, h.observaciones, ahora).calibracion);
    setResumen(resumirExactitud(h.predicciones, h.observaciones, ahora));
  }, []);

  // Al montar: purga lo vencido y carga el historial para calibrar desde el primer render útil.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const ahora = Date.now();
        await purgarAntiguos(ahora);
        const h = await cargarHistorial();
        if (!vigente) {
          return;
        }
        registrados.current = new Set([...h.predicciones, ...h.observaciones].map((r) => r.id));
        actualizarHistorial(h);
        recalcular(h, ahora);
      } catch {
        if (vigente) {
          degradar();
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, [recalcular, actualizarHistorial, degradar]);

  const celda = punto ? geohashEncode(punto.lat, punto.lon) : null;

  // Registra la PoP de cada hora futura tal como salió de la mezcla (nunca la calibrada: se
  // contaminaría el ajuste con su propia salida).
  useEffect(() => {
    if (!disponible || !historial || !resultado || !mezcla || !celda) {
      return;
    }
    const nuevas = crearPredicciones({
      celda,
      emitidoMs: ahoraMs,
      horasUtc: resultado.horasUtc,
      pop: mezcla.pop,
      popEnsamble: resultado.pop,
      pesoRadar: mezcla.pesoRadar,
    }).filter((p) => !registrados.current.has(p.id));
    if (nuevas.length === 0) {
      return;
    }
    nuevas.forEach((p) => registrados.current.add(p.id));
    void guardarPredicciones(nuevas)
      .then(() => {
        const h = historialActual.current;
        if (h && disponibleActual.current) {
          actualizarHistorial({ ...h, predicciones: unirPorId(h.predicciones, nuevas) });
        }
      })
      .catch(degradar);
  }, [disponible, historial, resultado, mezcla, ahoraMs, celda, actualizarHistorial, degradar]);

  // Tras un nowcast bueno, lo que el radar vio en el punto alimenta la verificación.
  useEffect(() => {
    if (!disponible || !historial || !nowcast || !celda) {
      return;
    }
    const nuevas = observacionesDeRadar(nowcast, celda).filter(
      (o) => !registrados.current.has(o.id),
    );
    if (nuevas.length === 0) {
      return;
    }
    nuevas.forEach((o) => registrados.current.add(o.id));
    void guardarObservaciones(nuevas)
      .then(() => {
        const h = historialActual.current;
        if (!h || !disponibleActual.current) {
          return;
        }
        const actualizado = { ...h, observaciones: unirPorId(h.observaciones, nuevas) };
        actualizarHistorial(actualizado);
        recalcular(actualizado, Date.now());
      })
      .catch(degradar);
  }, [disponible, historial, nowcast, celda, recalcular, actualizarHistorial, degradar]);

  const registrarObservacionUsuario = useCallback(
    async (lluvia: boolean, tMs: number = Date.now()) => {
      if (!disponibleActual.current || !historialActual.current || !celda) {
        return false;
      }
      const obs: Observacion = observacionDeUsuario(celda, lluvia, tMs);
      if (registrados.current.has(obs.id)) {
        return false;
      }
      registrados.current.add(obs.id);
      try {
        const nuevas = await guardarObservaciones([obs]);
        const h = historialActual.current;
        if (!h || !disponibleActual.current || nuevas === 0) {
          return false;
        }
        const actualizado = { ...h, observaciones: unirPorId(h.observaciones, [obs]) };
        actualizarHistorial(actualizado);
        recalcular(actualizado, Date.now());
        return true;
      } catch {
        degradar();
        return false;
      }
    },
    [celda, recalcular, actualizarHistorial, degradar],
  );

  const exportar = useCallback(
    async () => {
      if (!disponibleActual.current) {
        throw new Error('El historial local no está disponible en este navegador.');
      }
      try {
        return JSON.stringify(await exportarHistorial(Date.now()), null, 2);
      } catch (error) {
        degradar();
        throw error;
      }
    },
    [degradar],
  );

  const importar = useCallback(
    async (datos: unknown) => {
      if (!disponibleActual.current) {
        throw new Error('El historial local no está disponible en este navegador.');
      }
      // Un archivo inválido es un error de entrada, no un fallo de IndexedDB.
      validarHistorial(datos);
      try {
        const agregados = await importarHistorial(datos);
        const h = await cargarHistorial();
        registrados.current = new Set(
          [...h.predicciones, ...h.observaciones].map((r: Prediccion | Observacion) => r.id),
        );
        actualizarHistorial(h);
        recalcular(h, Date.now());
        return agregados;
      } catch (error) {
        degradar();
        throw error;
      }
    },
    [recalcular, actualizarHistorial, degradar],
  );

  const borrar = useCallback(async () => {
    if (!disponibleActual.current) {
      throw new Error('El historial local no está disponible en este navegador.');
    }
    try {
      await borrarHistorial();
      // Conserva los ids de esta sesión para no reinsertar los mismos frames al borrar.
      const vacio: Historial = { predicciones: [], observaciones: [] };
      actualizarHistorial(vacio);
      recalcular(vacio, Date.now());
    } catch (error) {
      degradar();
      throw error;
    }
  }, [recalcular, actualizarHistorial, degradar]);

  return {
    disponible,
    calibracion,
    resumen,
    registrarObservacionUsuario,
    exportar,
    importar,
    borrar,
  };
}
