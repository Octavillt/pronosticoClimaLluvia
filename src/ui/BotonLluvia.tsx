import { useState, type CSSProperties } from 'react';

interface Props {
  disponible: boolean;
  cargando?: boolean;
  lugar: string | null;
  registrarObservacionUsuario: (lluvia: boolean) => Promise<boolean>;
}

const boton: CSSProperties = { minHeight: 44, padding: '8px 12px' };

export function BotonLluvia({ disponible, cargando = false, lugar, registrarObservacionUsuario }: Props) {
  const [guardando, setGuardando] = useState(false);
  const [registrado, setRegistrado] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registrar = async (lluvia: boolean) => {
    setGuardando(true);
    setRegistrado(null);
    setError(null);
    try {
      const guardado = await registrarObservacionUsuario(lluvia);
      setRegistrado(guardado);
    } catch {
      setError('No se pudo registrar la observación.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section aria-label="Observación de lluvia" style={{ margin: '16px 0' }}>
      <h2 style={{ fontSize: '1rem' }}>
        {lugar === null ? '¿Está lloviendo?' : `¿Está lloviendo en ${lugar}?`}
      </h2>
      {lugar !== null && (
        <p style={{ fontSize: '0.85rem' }}>
          Reporta solo lo que ves donde estás: estos reportes calibran el pronóstico de este lugar.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          style={boton}
          disabled={!disponible || cargando || guardando}
          onClick={() => void registrar(true)}
        >
          Sí, está lloviendo
        </button>
        <button
          style={boton}
          disabled={!disponible || cargando || guardando}
          onClick={() => void registrar(false)}
        >
          No está lloviendo
        </button>
      </div>
      {!disponible ? (
        <p>El almacenamiento local no está disponible; no se pueden registrar observaciones.</p>
      ) : cargando ? (
        <p>Cargando historial local…</p>
      ) : (
        registrado !== null && (
          <p role="status">
            {registrado
              ? 'Gracias, registrado.'
              : 'No se registró: ya hay una observación en este instante ' +
                'o el historial aún no está listo.'}
          </p>
        )
      )}
      {error && disponible && <p role="alert">{error}</p>}
    </section>
  );
}
