import type { GeoPoint } from '../domain/types';

interface Props {
  punto: GeoPoint;
  nombre: string | null;
  onCambiar: () => void;
}

export function UbicacionActual({ punto, nombre, onCambiar }: Props) {
  return (
    <section aria-label="Ubicación actual">
      <p>
        <strong>{nombre ?? 'Tu ubicación'}</strong> ({punto.lat.toFixed(2)}, {punto.lon.toFixed(2)}
        ) <button onClick={onCambiar}>Cambiar</button>
      </p>
    </section>
  );
}
