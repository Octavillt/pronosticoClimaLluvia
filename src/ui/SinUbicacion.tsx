import type { GeoPoint } from '../domain/types';
import { AlertaEstado } from './AlertaEstado';
import { BuscadorCiudad } from './BuscadorCiudad';
import './Estados.css';

interface Props {
  fueraDeMexico: boolean;
  ubicacionFallida: boolean;
  onUsarUbicacion: () => void;
  onElegir: (punto: GeoPoint, nombre: string) => void;
}

export function SinUbicacion({ fueraDeMexico, ubicacionFallida, onUsarUbicacion, onElegir }: Props) {
  return (
    <div className="estado">
      {fueraDeMexico ? (
        <AlertaEstado
          titulo="Esta ubicación está fuera de México."
          detalle="Elige una ciudad mexicana."
        />
      ) : (
        ubicacionFallida && (
          <p className="estado__texto">
            No pudimos obtener tu ubicación. Busca tu ciudad o vuelve a intentarlo.
          </p>
        )
      )}
      <button type="button" className="boton boton--secundario estado__boton" onClick={onUsarUbicacion}>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
          <circle cx="12" cy="10.5" r="2.3" />
        </svg>
        Usar mi ubicación
      </button>
      <BuscadorCiudad onElegir={onElegir} />
    </div>
  );
}
