import { circleMarker, map as crearMapa, tileLayer, type Map as MapaLeaflet, type TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { config } from '../config';
import type { GeoPoint, IndiceRadar } from '../domain/types';
import { plantillaTilesMapa } from '../providers/rainviewer';
import { formatHoraLocal } from '../utils/localTime';
import './Radar.css';
import './MapaRadar.css';

interface Props {
  punto: GeoPoint;
  nombre: string | null;
  indice: IndiceRadar;
  timezone: string;
  ahoraMs?: number;
}

const OPACIDAD_RADAR = 0.7;
const PASO_ANIMACION_MS = 700;
const ZOOM_MAPA_MAXIMO = 10;

export default function MapaRadar({ punto, nombre, indice, timezone, ahoraMs = Date.now() }: Props) {
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
    tileLayer(config.urls.mapaBase, {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      className: 'mapa-radar__base',
    }).addTo(nuevo);
    circleMarker([punto.lat, punto.lon], {
      radius: 17,
      weight: 2,
      fill: false,
      interactive: false,
      className: 'mapa-radar__marcador-halo',
    }).addTo(nuevo);
    circleMarker([punto.lat, punto.lon], {
      radius: 9,
      weight: 0,
      interactive: false,
      className: 'mapa-radar__marcador-borde',
    }).addTo(nuevo);
    circleMarker([punto.lat, punto.lon], {
      radius: 5,
      weight: 0,
      interactive: false,
      className: 'mapa-radar__marcador-centro',
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
  const ultimoFotogramaMs = frames[frames.length - 1].tiempoS * 1000;
  const antiguedadMin = Math.max(1, Math.round((ahoraMs - ultimoFotogramaMs) / 60_000));

  return (
    <section className="tarjeta radar" aria-label="Mapa de radar">
      <div className="radar__cabecera">
        <h2 className="radar__titulo">Radar</h2>
        <span className="radar__antiguedad">Hace {antiguedadMin} min</span>
      </div>
      <div className="radar__mapa" ref={contenedor} data-testid="mapa-radar" />
      <div className="radar__controles">
        <button
          className="radar__animar" type="button" onClick={() => setAnimando((a) => !a)}
          aria-label={animando ? 'Pausar' : 'Animar'} aria-pressed={animando}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={animando ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5.5v13l10.5-6.5z'} />
          </svg>
        </button>
        <input
          className="radar__fotograma"
          type="range"
          aria-label="Fotograma del radar"
          min={0}
          max={frames.length - 1}
          value={actual}
          onChange={(e) => {
            setAnimando(false);
            setManual(frames[Number(e.target.value)].ruta);
          }}
        />
        <time className="radar__hora" data-testid="hora-fotograma"
          dateTime={new Date(frameActual.tiempoS * 1000).toISOString()}>
          {hora} h
        </time>
      </div>
      {actual === frames.length - 1 && <p className="radar__reciente">(más reciente)</p>}
    </section>
  );
}
