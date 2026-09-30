import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { config } from './config';
import type {
  EstadoRadar,
  GeoPoint,
  IndiceRadar,
  Nowcast,
  ResultadoPronostico,
} from './domain/types';
import { mezclarPop } from './services/blend';
import { calibrarSerie } from './services/calibracion';
import { obtenerPronostico } from './services/forecastService';
import { obtenerNowcast } from './services/nowcastService';
import { horizonteDe } from './services/verificacion';
import type { ControladorPwa } from './pwa/registro';
import { useActualizacionPwa } from './pwa/useActualizacionPwa';
import { useEnLinea } from './pwa/useEnLinea';
import { AvisoActualizacion } from './ui/AvisoActualizacion';
import { AvisoSinConexion } from './ui/AvisoSinConexion';
import { BuscadorCiudad } from './ui/BuscadorCiudad';
import { BotonLluvia } from './ui/BotonLluvia';
import { EstadoFuentes } from './ui/EstadoFuentes';
import { LineaDeHoras } from './ui/LineaDeHoras';
import { ProbabilidadAhora } from './ui/ProbabilidadAhora';
import { PanelExactitud } from './ui/PanelExactitud';
import { UbicacionActual } from './ui/UbicacionActual';
import { useVerificacion } from './ui/useVerificacion';
import { indiceHoraEnCurso, MS_HORA } from './utils/horas';

// Leaflet pesa bastante: solo se descarga cuando hay radar que mostrar.
const MapaRadar = lazy(() => import('./ui/MapaRadar'));

type Fase = 'solicitando' | 'sin-ubicacion' | 'fuera-mexico' | 'error' | 'listo';

const REFRESCO_RADAR_MS = 5 * 60_000;
const REFRESCO_RELOJ_MS = 60_000;
const PESO_RADAR_VISIBLE = 0.05;

export default function App({ controladorPwa = null }: { controladorPwa?: ControladorPwa | null }) {
  const hayActualizacion = useActualizacionPwa(controladorPwa);
  const enLinea = useEnLinea();
  const [fase, setFase] = useState<Fase>('solicitando');
  const [punto, setPunto] = useState<GeoPoint | null>(null);
  const [nombreLugar, setNombreLugar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoPronostico, { tipo: 'ok' }> | null>(
    null,
  );
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [radar, setRadar] = useState<EstadoRadar>({ estado: 'cargando' });
  const [nowcast, setNowcast] = useState<Nowcast | null>(null);
  const [indiceRadar, setIndiceRadar] = useState<IndiceRadar | null>(null);
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());

  const cargar = useCallback(async (destino: GeoPoint, nombre: string | null) => {
    setFase('solicitando');
    setMensajeError(null);
    setNowcast(null);
    setIndiceRadar(null);
    setPunto(destino);
    setNombreLugar(nombre);
    try {
      const pronostico = await obtenerPronostico(destino);
      if (pronostico.tipo === 'fuera-mexico') {
        setFase('fuera-mexico');
        return;
      }
      setResultado(pronostico);
      setFase('listo');
    } catch (error) {
      setMensajeError(error instanceof Error ? error.message : 'Error desconocido');
      setFase('error');
    }
  }, []);

  const usarGeolocalizacion = useCallback(() => {
    if (!navigator.geolocation) {
      setFase('sin-ubicacion');
      return;
    }
    setFase('solicitando');
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        void cargar({ lat: posicion.coords.latitude, lon: posicion.coords.longitude }, null),
      () => setFase('sin-ubicacion'),
    );
  }, [cargar]);

  useEffect(() => {
    usarGeolocalizacion();
  }, [usarGeolocalizacion]);

  // Reloj: la hora "en curso" avanza sola aunque la pestaña quede abierta.
  useEffect(() => {
    const temporizador = setInterval(() => setAhoraMs(Date.now()), REFRESCO_RELOJ_MS);
    return () => clearInterval(temporizador);
  }, []);

  // Radar: el ensamble se cachea por corrida del modelo, pero el radar cambia cada 10 min.
  useEffect(() => {
    if (fase !== 'listo' || !punto) {
      return;
    }
    let vigente = true;
    const sinRadar = (estado: EstadoRadar) => {
      setNowcast(null);
      setIndiceRadar(null);
      setRadar(estado);
    };
    const consultar = async () => {
      try {
        const resultadoRadar = await obtenerNowcast(punto);
        if (!vigente) {
          return;
        }
        setAhoraMs(Date.now());
        switch (resultadoRadar.tipo) {
          case 'ok':
            setNowcast(resultadoRadar.nowcast);
            setIndiceRadar(resultadoRadar.indice);
            setRadar({
              estado: 'ok',
              tFrameMs: resultadoRadar.nowcast.tFrameMs,
              avance: resultadoRadar.nowcast.avance,
            });
            break;
          case 'sin-cobertura':
            sinRadar({ estado: 'sin-cobertura' });
            break;
          case 'desactualizado':
            sinRadar({ estado: 'desactualizado', edadMin: resultadoRadar.edadMin });
            break;
          case 'sin-datos':
            sinRadar({ estado: 'error', mensaje: resultadoRadar.motivo });
            break;
        }
      } catch (error) {
        if (vigente) {
          sinRadar({
            estado: 'error',
            mensaje: error instanceof Error ? error.message : 'Error desconocido',
          });
        }
      }
    };
    sinRadar({ estado: 'cargando' });
    void consultar();
    const temporizador = setInterval(() => void consultar(), REFRESCO_RADAR_MS);
    return () => {
      vigente = false;
      clearInterval(temporizador);
    };
  }, [fase, punto]);

  const mezcla = useMemo(
    () =>
      resultado
        ? mezclarPop({
            horasUtc: resultado.horasUtc,
            popEnsamble: resultado.pop,
            nowcast,
            ahoraMs,
          })
        : null,
    [resultado, nowcast, ahoraMs],
  );
  const horaEnCurso = resultado ? indiceHoraEnCurso(resultado.horasUtc, ahoraMs) : 0;

  // Lo que se registra es la PoP sin calibrar; la calibración solo corrige lo que se muestra.
  const verificacion = useVerificacion({
    punto: fase === 'listo' ? punto : null,
    resultado: fase === 'listo' ? resultado : null,
    mezcla: fase === 'listo' ? mezcla : null,
    nowcast: fase === 'listo' ? nowcast : null,
    ahoraMs,
  });

  const popMostrada = useMemo(
    () =>
      resultado && mezcla
        ? calibrarSerie(verificacion.calibracion, resultado.horasUtc, mezcla.pop, ahoraMs)
        : null,
    [resultado, mezcla, ahoraMs, verificacion.calibracion],
  );

  const horasVerificadasEnCurso = useMemo(() => {
    if (!resultado) {
      return null;
    }
    const horizonteH = horizonteDe(
      (Date.parse(resultado.horasUtc[horaEnCurso]) - ahoraMs) / MS_HORA,
    );
    return horizonteH === null ? null : (verificacion.calibracion[horizonteH]?.n ?? null);
  }, [resultado, horaEnCurso, ahoraMs, verificacion.calibracion]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <AvisoActualizacion
        visible={hayActualizacion}
        onActualizar={() => controladorPwa?.activar()}
      />
      <AvisoSinConexion enLinea={enLinea} />
      <h1>{config.appName}</h1>

      {fase === 'solicitando' && <p role="status">Obteniendo pronóstico…</p>}

      {(fase === 'sin-ubicacion' || fase === 'fuera-mexico') && (
        <>
          {fase === 'fuera-mexico' && (
            <p role="alert">Esta ubicación está fuera de México. Elige una ciudad mexicana.</p>
          )}
          <button onClick={usarGeolocalizacion}>Usar mi ubicación</button>
          <BuscadorCiudad onElegir={(p, nombre) => void cargar(p, nombre)} />
        </>
      )}

      {fase === 'error' && (
        <section>
          <p role="alert">No se pudo obtener el pronóstico: {mensajeError}</p>
          <button onClick={() => punto && void cargar(punto, nombreLugar)}>Reintentar</button>
        </section>
      )}

      {fase === 'listo' && resultado && mezcla && popMostrada && punto && (
        <>
          <UbicacionActual
            punto={punto}
            nombre={nombreLugar}
            onCambiar={() => setFase('sin-ubicacion')}
          />
          <ProbabilidadAhora
            pop={popMostrada[horaEnCurso]}
            horaUtc={resultado.horasUtc[horaEnCurso]}
            timezone={resultado.timezone}
            conRadar={mezcla.pesoRadar[horaEnCurso] > PESO_RADAR_VISIBLE}
            horasVerificadas={horasVerificadasEnCurso}
          />
          <BotonLluvia
            key={`${punto.lat}|${punto.lon}`}
            disponible={verificacion.disponible}
            lugar={nombreLugar}
            cargando={verificacion.resumen === null}
            registrarObservacionUsuario={verificacion.registrarObservacionUsuario}
          />
          <LineaDeHoras
            horasUtc={resultado.horasUtc}
            pop={popMostrada}
            pesoRadar={mezcla.pesoRadar}
            desde={horaEnCurso}
            timezone={resultado.timezone}
          />
          {radar.estado === 'ok' && indiceRadar && (
            <Suspense fallback={<p role="status">Cargando mapa del radar…</p>}>
              <MapaRadar
                punto={punto}
                nombre={nombreLugar}
                indice={indiceRadar}
                timezone={resultado.timezone}
              />
            </Suspense>
          )}
          <PanelExactitud
            resumen={verificacion.resumen}
            disponible={verificacion.disponible}
            exportar={verificacion.exportar}
            importar={verificacion.importar}
            borrar={verificacion.borrar}
          />
          <EstadoFuentes fuentes={resultado.fuentes} radar={radar} timezone={resultado.timezone} />
          <p style={{ fontSize: '0.8rem' }}>
            Datos: Open-Meteo, radar de RainViewer y mapa © OpenStreetMap.
          </p>
        </>
      )}
    </main>
  );
}
