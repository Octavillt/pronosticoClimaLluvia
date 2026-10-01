import type { EstadoRadar } from '../domain/types';
import './Radar.css';

interface Props {
  estado: Extract<EstadoRadar, { estado: 'sin-cobertura' | 'desactualizado' }>;
}

export function RadarEstado({ estado }: Props) {
  const edadMin = estado.estado === 'desactualizado' ? Math.round(estado.edadMin) : null;
  const etiqueta = edadMin === null ? 'Sin cobertura' : `Hace ${edadMin} min`;
  const mensaje = edadMin === null
    ? 'Tu zona está fuera del alcance del radar. La probabilidad usa solo el ensamble de modelos.'
    : `La imagen más reciente del radar es de hace ${edadMin} min y no se usa en el pronóstico.`;
  return (
    <section className="radar tarjeta" aria-label="Estado del radar">
      <div className="radar__cabecera">
        <h2 className="radar__titulo">Radar</h2>
        <span className="radar__antiguedad radar__antiguedad--neutra">{etiqueta}</span>
      </div>
      <div className="radar__ilustracion">
        <svg
          viewBox="0 0 334 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"
        >
          <rect className="radar__mapa-fondo" width="334" height="170" />
          <rect className="radar__mapa-parque" x="20" y="17" width="67" height="37" rx="14" />
          <path className="radar__mapa-agua"
            d="M0 136 C 67 122, 117 156, 184 146 S 301 122, 334 133 L 334 170 L 0 170 Z" />
          <g className="radar__mapa-rejilla">
            <line x1="60" y1="0" x2="60" y2="170" />
            <line x1="174" y1="0" x2="174" y2="170" />
            <line x1="267" y1="0" x2="267" y2="170" />
            <line x1="0" y1="34" x2="334" y2="34" />
            <line x1="0" y1="119" x2="334" y2="119" />
          </g>
          <g className="radar__mapa-calle">
            <path d="M0 68 C 100 51, 200 85, 334 61" />
            <path d="M214 0 C 194 68, 234 119, 220 170" />
          </g>
          <circle className="radar__ubicacion-halo" cx="140" cy="88" r="17" />
          <circle className="radar__ubicacion-borde" cx="140" cy="88" r="9" />
          <circle className="radar__ubicacion-centro" cx="140" cy="88" r="5" />
        </svg>
      </div>
      <p className="radar__explicacion">
        <svg
          className="radar__advertencia" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
        <span>{mensaje}</span>
      </p>
    </section>
  );
}
