import './Avisos.css';

const TRAZO_SIN_WIFI = [
  'M3 3l18 18M8.5 8.8A9 9 0 0 1 21 12M3 12a9 9 0 0 1 4-2.4',
  'M12 17.5h.01M8.5 14.5a5 5 0 0 1 3.5-1.4',
].join('');

export function AvisoSinConexion({ enLinea }: { enLinea: boolean }) {
  if (enLinea) return null;
  return (
    <div role="status" className="aviso aviso--sin-conexion">
      <span className="aviso__texto">
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="aviso__icono"
        >
          <path d={TRAZO_SIN_WIFI} />
        </svg>
        Sin conexión. Puede que el pronóstico no esté actualizado.
      </span>
    </div>
  );
}
