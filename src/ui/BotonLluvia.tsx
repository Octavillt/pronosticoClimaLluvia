import { useState } from 'react';
import './BotonLluvia.css';

interface Props {
  disponible: boolean;
  cargando?: boolean;
  lugar: string | null;
  registrarObservacionUsuario: (lluvia: boolean) => Promise<boolean>;
}

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
    <section aria-label="Observación de lluvia" className="tarjeta lluvia">
      <h2 className="lluvia__titulo">
        {lugar === null ? '¿Está lloviendo?' : `¿Está lloviendo en ${lugar}?`}
      </h2>
      <p className="lluvia__subtitulo">
        {lugar !== null
          ? 'Reporta solo lo que ves donde estás: estos reportes calibran el pronóstico de este lugar.'
          : 'Tus respuestas hacen más exacto el pronóstico aquí.'}
      </p>
      <div className="lluvia__botones">
        <button
          className="boton boton--primario"
          disabled={!disponible || cargando || guardando}
          onClick={() => void registrar(true)}
        >
          Sí, está lloviendo
        </button>
        <button
          className="boton boton--secundario"
          disabled={!disponible || cargando || guardando}
          onClick={() => void registrar(false)}
        >
          No está lloviendo
        </button>
      </div>
      {!disponible ? (
        <p className="lluvia__mensaje">
          El almacenamiento local no está disponible; no se pueden registrar observaciones.
        </p>
      ) : cargando ? (
        <p className="lluvia__mensaje">Cargando historial local…</p>
      ) : (
        registrado !== null && (
          <p className="lluvia__mensaje" role="status">
            {registrado
              ? 'Gracias, registrado.'
              : 'No se registró: ya hay una observación en este instante ' +
                'o el historial aún no está listo.'}
          </p>
        )
      )}
      {error && disponible && <p className="lluvia__mensaje lluvia__mensaje--error" role="alert">{error}</p>}
    </section>
  );
}
