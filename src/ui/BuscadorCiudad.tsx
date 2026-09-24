import { useState } from 'react';
import type { CiudadEncontrada, GeoPoint } from '../domain/types';
import { buscarCiudad } from '../providers/geocoding';

interface Props {
  onElegir: (punto: GeoPoint, nombre: string) => void;
}

export function BuscadorCiudad({ onElegir }: Props) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<CiudadEncontrada[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    if (texto.trim().length < 2) {
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const ciudades = await buscarCiudad(texto.trim());
      setResultados(ciudades);
      if (ciudades.length === 0) {
        setError('Sin resultados en México');
      }
    } catch {
      setError('No se pudo buscar. Intenta de nuevo.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section aria-label="Buscar ciudad">
      <h2>Busca tu ciudad</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <input
          aria-label="Nombre de la ciudad"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej. Guadalajara"
        />
        <button type="submit" disabled={buscando}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {resultados.map((c) => (
          <li key={`${c.lat},${c.lon}`}>
            <button onClick={() => onElegir({ lat: c.lat, lon: c.lon }, c.nombre)}>
              {c.nombre}
              {c.estado ? `, ${c.estado}` : ''}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
