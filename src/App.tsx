import { useCallback, useEffect, useState } from 'react';
import { config } from './config';
import type { GeoPoint, ResultadoPronostico } from './domain/types';
import { obtenerPronostico } from './services/forecastService';
import { BuscadorCiudad } from './ui/BuscadorCiudad';
import { EstadoFuentes } from './ui/EstadoFuentes';
import { LineaDeHoras } from './ui/LineaDeHoras';
import { ProbabilidadAhora } from './ui/ProbabilidadAhora';
import { UbicacionActual } from './ui/UbicacionActual';

type Fase = 'solicitando' | 'sin-ubicacion' | 'fuera-mexico' | 'error' | 'listo';

function indiceHoraActual(horasUtc: string[], ahora: Date): number {
  const truncada = new Date(ahora);
  truncada.setMinutes(0, 0, 0);
  const objetivo = truncada.toISOString().slice(0, 16);
  const indice = horasUtc.findIndex((h) => h.slice(0, 16) >= objetivo);
  return indice === -1 ? 0 : indice;
}

export default function App() {
  const [fase, setFase] = useState<Fase>('solicitando');
  const [punto, setPunto] = useState<GeoPoint | null>(null);
  const [nombreLugar, setNombreLugar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoPronostico, { tipo: 'ok' }> | null>(
    null,
  );
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const cargar = useCallback(async (destino: GeoPoint, nombre: string | null) => {
    setFase('solicitando');
    setMensajeError(null);
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

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: 16 }}>
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

      {fase === 'listo' && resultado && punto && (
        <>
          <UbicacionActual
            punto={punto}
            nombre={nombreLugar}
            onCambiar={() => setFase('sin-ubicacion')}
          />
          <ProbabilidadAhora
            pop={resultado.pop[indiceHoraActual(resultado.horasUtc, new Date())]}
            horaUtc={resultado.horasUtc[indiceHoraActual(resultado.horasUtc, new Date())]}
            timezone={resultado.timezone}
          />
          <LineaDeHoras
            horasUtc={resultado.horasUtc}
            pop={resultado.pop}
            timezone={resultado.timezone}
          />
          <EstadoFuentes fuentes={resultado.fuentes} />
        </>
      )}
    </main>
  );
}
