import { AlertaEstado } from './AlertaEstado';
import './Estados.css';

interface Props {
  mensaje: string;
  onReintentar: () => void;
}

const SUGERENCIA = 'Revisa tu conexión e inténtalo de nuevo.';

export function ErrorPronostico({ mensaje, onReintentar }: Props) {
  // El mensaje técnico puede traer punto final: se normaliza para no duplicarlo.
  const causa = mensaje.trim().replace(/[.\s]+$/, '');
  return (
    <div className="estado">
      <AlertaEstado
        titulo="No se pudo obtener el pronóstico"
        detalle={causa ? `${causa}. ${SUGERENCIA}` : SUGERENCIA}
      />
      <button type="button" className="boton boton--primario estado__boton" onClick={onReintentar}>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M20 5v5h-5M4 19v-5h5M18 10A7 7 0 0 0 6 8M6 14a7 7 0 0 0 12 2" />
        </svg>
        Reintentar
      </button>
    </div>
  );
}
