import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
import { Aprendizaje } from './ui/Aprendizaje';
import { AvisoSinConexion } from './ui/AvisoSinConexion';
import { BotonLluvia } from './ui/BotonLluvia';
import { Cielo } from './ui/Cielo';
import { Encabezado } from './ui/Encabezado';
import { ErrorPronostico } from './ui/ErrorPronostico';
import { EsqueletoCielo } from './ui/EsqueletoCielo';
import { EstadoFuentes } from './ui/EstadoFuentes';
import { GestionHistorial } from './ui/GestionHistorial';
import { ProximasHoras } from './ui/ProximasHoras';
import { RadarEsqueleto } from './ui/RadarEsqueleto';
import { SinUbicacion } from './ui/SinUbicacion';
import { RadarEstado } from './ui/RadarEstado';
import { useVerificacion } from './ui/useVerificacion';
import { indiceHoraEnCurso, MS_HORA } from './utils/horas';
import { resumirCielo } from './utils/mensajeCielo';
import { progresoAprendizaje } from './utils/aprendizaje';
import './App.css';

// Leaflet pesa bastante: solo se descarga cuando hay radar que mostrar.
const MapaRadar = lazy(() => import('./ui/MapaRadar'));

type Fase = 'solicitando' | 'sin-ubicacion' | 'fuera-mexico' | 'error' | 'listo';

const REFRESCO_RADAR_MS = 5 * 60_000;
const REFRESCO_RELOJ_MS = 60_000;

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
  const [ubicacionFallida, setUbicacionFallida] = useState(false);
  const [radar, setRadar] = useState<EstadoRadar>({ estado: 'cargando' });
  const [nowcast, setNowcast] = useState<Nowcast | null>(null);
  const [indiceRadar, setIndiceRadar] = useState<IndiceRadar | null>(null);
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());

  const cargar = useCallback(async (destino: GeoPoint, nombre: string | null) => {
    setFase('solicitando');
    setMensajeError(null);
    setUbicacionFallida(false);
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
    const sinUbicacion = () => {
      setUbicacionFallida(true);
      setFase('sin-ubicacion');
    };
    if (!navigator.geolocation) {
      sinUbicacion();
      return;
    }
    setFase('solicitando');
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        void cargar({ lat: posicion.coords.latitude, lon: posicion.coords.longitude }, null),
      sinUbicacion,
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

  const horizonteH = useMemo(() => {
    if (!resultado) {
      return null;
    }
    return horizonteDe(
      (Date.parse(resultado.horasUtc[horaEnCurso]) - ahoraMs) / MS_HORA,
    );
  }, [resultado, horaEnCurso, ahoraMs]);
  const horasVerificadasEnCurso = horizonteH === null
    ? null : (verificacion.calibracion[horizonteH]?.n ?? null);
  const progreso = useMemo(
    () => progresoAprendizaje(verificacion.resumen, verificacion.disponible, horizonteH),
    [verificacion.resumen, verificacion.disponible, horizonteH],
  );

  const resumen = useMemo(
    () => resultado && mezcla && popMostrada ? resumirCielo({
      horasUtc: resultado.horasUtc,
      pop: popMostrada,
      pesoRadar: mezcla.pesoRadar,
      indice: horaEnCurso,
      ahoraMs,
      timezone: resultado.timezone,
      radar,
    }) : null,
    [resultado, mezcla, popMostrada, horaEnCurso, ahoraMs, radar],
  );

  return (
    <main className="app">
      <AvisoActualizacion
        visible={hayActualizacion}
        onActualizar={() => controladorPwa?.activar()}
      />
      <AvisoSinConexion enLinea={enLinea} />
      {fase === 'solicitando' && <EsqueletoCielo />}

      {(fase === 'sin-ubicacion' || fase === 'fuera-mexico') && (
        <>
          <Encabezado />
          <SinUbicacion
            fueraDeMexico={fase === 'fuera-mexico'}
            ubicacionFallida={ubicacionFallida}
            onUsarUbicacion={usarGeolocalizacion}
            onElegir={(p, nombre) => void cargar(p, nombre)}
          />
        </>
      )}

      {fase === 'error' && (
        <>
          <Encabezado />
          <ErrorPronostico
            mensaje={mensajeError ?? ''}
            onReintentar={() => punto && void cargar(punto, nombreLugar)}
          />
        </>
      )}

      {fase === 'listo' && resultado && mezcla && popMostrada && punto && resumen && (
        <>
          <Cielo
            punto={punto}
            nombre={nombreLugar}
            resumen={resumen}
            horasVerificadas={horasVerificadasEnCurso}
            onCambiar={() => {
              setUbicacionFallida(false);
              setFase('sin-ubicacion');
            }}
          />
          <ProximasHoras
            horasUtc={resultado.horasUtc}
            pop={popMostrada}
            pesoRadar={mezcla.pesoRadar}
            desde={horaEnCurso}
            ahoraMs={ahoraMs}
            timezone={resultado.timezone}
          />
          {radar.estado === 'ok' && indiceRadar && (
            <Suspense fallback={<RadarEsqueleto />}>
              <MapaRadar
                punto={punto}
                nombre={nombreLugar}
                indice={indiceRadar}
                timezone={resultado.timezone}
                ahoraMs={ahoraMs}
                avance={radar.estado === 'ok' ? radar.avance : null}
              />
            </Suspense>
          )}
          {(radar.estado === 'sin-cobertura' || radar.estado === 'desactualizado') && (
            <RadarEstado estado={radar} />
          )}
          <BotonLluvia
            key={`${punto.lat}|${punto.lon}`}
            disponible={verificacion.disponible}
            lugar={nombreLugar}
            cargando={verificacion.resumen === null}
            registrarObservacionUsuario={verificacion.registrarObservacionUsuario}
          />
          <Aprendizaje progreso={progreso} observaciones={verificacion.resumen?.observaciones ?? null}
            panel={{
              resumen: verificacion.resumen,
              disponible: verificacion.disponible,
              exportar: verificacion.exportar,
              importar: verificacion.importar,
              borrar: verificacion.borrar,
            }} />
          <GestionHistorial
            resumen={verificacion.resumen}
            disponible={verificacion.disponible}
            exportar={verificacion.exportar}
            importar={verificacion.importar}
            borrar={verificacion.borrar}
          />
          <EstadoFuentes fuentes={resultado.fuentes} radar={radar} timezone={resultado.timezone} />
          <p className="app__creditos">
            Datos: Open-Meteo, radar de RainViewer y mapa © OpenStreetMap.
          </p>
        </>
      )}
    </main>
  );
}
