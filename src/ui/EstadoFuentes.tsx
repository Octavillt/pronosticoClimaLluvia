import type { EstadoFuentes, EstadoRadar } from '../domain/types';
import { formatHoraLocal } from '../utils/localTime';
import { nombreRumbo } from '../utils/rumbo';

const ETIQUETAS: Record<string, string> = {
  ok: '✓',
  degradado: 'parcial',
  error: 'error',
};

function textoRadar(radar: EstadoRadar, timezone: string): string {
  switch (radar.estado) {
    case 'cargando':
      return 'consultando…';
    case 'ok': {
      const hora = formatHoraLocal(new Date(radar.tFrameMs).toISOString(), timezone);
      const avance = radar.avance
        ? `; la lluvia avanza a ${Math.round(radar.avance.kmh)} km/h hacia el ${nombreRumbo(radar.avance.haciaGrados)}`
        : '';
      return `✓ (imagen de las ${hora} h${avance})`;
    }
    case 'sin-cobertura':
      return 'sin cobertura en esta zona (solo ensamble)';
    case 'desactualizado':
      return `la imagen más reciente es de hace ${Math.round(radar.edadMin)} min y se ignora (solo ensamble)`;
    case 'error':
      return 'no disponible (solo ensamble)';
  }
}

export function EstadoFuentes({
  fuentes,
  radar,
  timezone = 'America/Mexico_City',
}: {
  fuentes: EstadoFuentes;
  radar?: EstadoRadar;
  timezone?: string;
}) {
  return (
    <section aria-label="Estado de fuentes">
      <h2>Fuentes</h2>
      <ul>
        <li>
          Ensamble Open-Meteo: {ETIQUETAS[fuentes.ensamble]}
          {fuentes.modelosFallidos.length > 0 &&
            ` (sin ${fuentes.modelosFallidos.join(', ')})`}
        </li>
        <li>Complemento horario: {ETIQUETAS[fuentes.complemento]}</li>
        {radar && <li>Radar RainViewer: {textoRadar(radar, timezone)}</li>}
        <li>Caché: {fuentes.cache === 'hit' ? 'reutilizado' : 'consultado'}</li>
      </ul>
    </section>
  );
}
