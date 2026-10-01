import { useState } from 'react';
import type { CiudadEncontrada, GeoPoint } from '../domain/types';
import { buscarCiudad } from '../providers/geocoding';
import './Estados.css';

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
    <section aria-label="Buscar ciudad" className="buscador">
      <h2 className="buscador__titulo">Busca tu ciudad</h2>
      <form
        className="buscador__form"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <input
          className="buscador__campo"
          aria-label="Nombre de la ciudad"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej. Guadalajara"
        />
        <button type="submit" className="boton boton--primario buscador__enviar" disabled={buscando}>
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6" />
            <path d="M16 16l4 4" />
          </svg>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {error && <p className="buscador__error" role="alert">{error}</p>}
      <ul className="buscador__lista">
        {resultados.map((c) => (
          <li key={`${c.lat},${c.lon}`}>
            <button
              type="button"
              className="buscador__resultado"
              onClick={() => onElegir({ lat: c.lat, lon: c.lon }, c.nombre)}
            >
              {c.nombre}
              {c.estado ? `, ${c.estado}` : ''}
              <svg
                className="buscador__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
