import './Estados.css';

interface Props {
  titulo: string;
  detalle: string;
}

/** Aviso rojo de las pantallas de estado (fuera de México, error del pronóstico). */
export function AlertaEstado({ titulo, detalle }: Props) {
  return (
    <div role="alert" className="estado__alerta">
      <svg
        width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="estado__alerta-icono"
      >
        <path d="M12 4l9 16H3z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
      <div>
        <div className="estado__alerta-titulo">{titulo}</div>
        <div className="estado__alerta-detalle">{detalle}</div>
      </div>
    </div>
  );
}
