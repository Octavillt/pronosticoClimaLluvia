import { circleMarker, map as crearMapa, tileLayer, type Map as MapaLeaflet, type TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { config } from '../config';
import type { GeoPoint, IndiceRadar } from '../domain/types';
import { plantillaTilesMapa } from '../providers/rainviewer';
import { formatHoraLocal } from '../utils/localTime';

interface Props {
  punto: GeoPoint;
  nombre: string | null;
  indice: IndiceRadar;
  timezone: string;
}

const OPACIDAD_RADAR = 0.7;
const PASO_ANIMACION_MS = 700;
const ZOOM_MAPA_MAXIMO = 10;

export default function MapaRadar({ punto, nombre, indice, timezone }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const capas = useRef(new Map<string, TileLayer>());
  const [mapa, setMapa] = useState<MapaLeaflet | null>(null);
  /** Ruta del fotograma elegido a mano; `null` sigue al más reciente. */
  const [manual, setManual] = useState<string | null>(null);
  const [animando, setAnimando] = useState(false);

  const { frames } = indice;
  const elegido = manual === null ? -1 : frames.findIndex((f) => f.ruta === manual);
  const actual = elegido >= 0 ? elegido : frames.length - 1;
  const frameActual = frames[actual];

  useEffect(() => {
    if (!contenedor.current) {
      return;
    }
    const nuevo = crearMapa(contenedor.current, {
      center: [punto.lat, punto.lon],
      zoom: config.radar.zoom,
      minZoom: 4,
      maxZoom: ZOOM_MAPA_MAXIMO,
      scrollWheelZoom: false,
    });
    tileLayer(config.urls.mapaBase, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(nuevo);
    circleMarker([punto.lat, punto.lon], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#dc2626',
      fillOpacity: 1,
    })
      .bindTooltip(nombre ?? 'Tu ubicación')
      .addTo(nuevo);
    const capasActuales = capas.current;
    setMapa(nuevo);
    return () => {
      nuevo.remove();
      capasActuales.clear();
      setMapa(null);
    };
  }, [punto.lat, punto.lon, nombre]);

  useEffect(() => {
    if (!mapa || !frameActual) {
      return;
    }
    const vigentes = new Set(frames.map((f) => f.ruta));
    for (const [ruta, capa] of capas.current) {
      if (!vigentes.has(ruta)) {
        capa.remove();
        capas.current.delete(ruta);
      }
    }
    // Un fotograma se descarga solo la primera vez que se muestra.
    if (!capas.current.has(frameActual.ruta)) {
      capas.current.set(
        frameActual.ruta,
        tileLayer(plantillaTilesMapa(indice.host, frameActual.ruta), {
          opacity: 0,
          maxNativeZoom: config.radar.zoom,
          maxZoom: ZOOM_MAPA_MAXIMO,
          zIndex: 5,
          attribution: 'Radar © RainViewer',
        }).addTo(mapa),
      );
    }
    for (const [ruta, capa] of capas.current) {
      capa.setOpacity(ruta === frameActual.ruta ? OPACIDAD_RADAR : 0);
    }
  }, [mapa, frames, frameActual, indice.host]);

  useEffect(() => {
    if (!animando || frames.length < 2) {
      return;
    }
    const temporizador = setInterval(() => {
      setManual((rutaActual) => {
        const i = rutaActual === null ? -1 : frames.findIndex((f) => f.ruta === rutaActual);
        const anterior = i >= 0 ? i : frames.length - 1;
        return frames[(anterior + 1) % frames.length].ruta;
      });
    }, PASO_ANIMACION_MS);
    return () => clearInterval(temporizador);
  }, [animando, frames]);

  if (!frameActual) {
    return null;
  }
  const hora = formatHoraLocal(new Date(frameActual.tiempoS * 1000).toISOString(), timezone);

  return (
    <section aria-label="Mapa de radar">
      <h2>Radar</h2>
      <div ref={contenedor} data-testid="mapa-radar" style={{ height: 360, width: '100%' }} />
      <p>
        <button onClick={() => setAnimando((a) => !a)} aria-pressed={animando}>
          {animando ? 'Pausar' : 'Animar'}
        </button>{' '}
        <input
          type="range"
          aria-label="Fotograma del radar"
          min={0}
          max={frames.length - 1}
          value={actual}
          onChange={(e) => {
            setAnimando(false);
            setManual(frames[Number(e.target.value)].ruta);
          }}
        />{' '}
        <time data-testid="hora-fotograma" dateTime={new Date(frameActual.tiempoS * 1000).toISOString()}>
          {hora} h
        </time>
        {actual === frames.length - 1 && ' (más reciente)'}
      </p>
    </section>
  );
}
