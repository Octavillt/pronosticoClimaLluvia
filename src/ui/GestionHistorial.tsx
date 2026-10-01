import { useState, type ChangeEvent } from 'react';
import type { EstadoVerificacion } from './useVerificacion';
import './GestionHistorial.css';

type Props = Pick<EstadoVerificacion, 'resumen' | 'disponible' | 'exportar' | 'importar' | 'borrar'>;

function leerArchivo(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.readAsText(archivo);
  });
}

export function GestionHistorial({ resumen, disponible, exportar, importar, borrar }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deshabilitado = !disponible || !resumen || ocupado;

  const ejecutar = async (accion: () => Promise<void>) => {
    setOcupado(true);
    setMensaje(null);
    setError(null);
    try {
      await accion();
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'No se pudo completar la operación.');
    } finally {
      setOcupado(false);
    }
  };

  const descargar = () =>
    ejecutar(async () => {
      const json = await exportar();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `sistemaclima-verificacion-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(enlace);
      try {
        enlace.click();
        setMensaje('Historial exportado.');
      } finally {
        enlace.remove();
        // El navegador inicia la descarga antes de liberar el contenido del enlace.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    });

  const cargarArchivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) {
      return;
    }
    void ejecutar(async () => {
      const texto = await leerArchivo(archivo);
      let datos: unknown;
      try {
        datos = JSON.parse(texto);
      } catch {
        throw new Error('El archivo no es JSON válido.');
      }
      const nuevos = await importar(datos);
      setMensaje(`Se agregaron ${nuevos.predicciones} predicciones y ${nuevos.observaciones} observaciones.`);
    });
  };

  return (
    <section className="datos" aria-label="Tus datos">
      <h2 className="datos__titulo">Tus datos · solo en este dispositivo</h2>
      <div className="datos__botones">
        <button className="boton boton--control" aria-label="Exportar historial"
          disabled={deshabilitado} onClick={() => void descargar()}>
          <svg className="datos__icono" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
          Exportar
        </button>
        <label className="boton boton--control datos__importar">
          <svg className="datos__icono" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />
          </svg>
          Importar<span className="solo-lectores"> historial</span>
          <input type="file" accept="application/json,.json" className="solo-lectores"
            disabled={deshabilitado} onChange={cargarArchivo} />
        </label>
        <button className="boton boton--control" aria-label="Borrar historial"
          disabled={deshabilitado} onClick={() => setConfirmarBorrado(true)}>
          <svg className="datos__icono" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />
          </svg>
          Borrar
        </button>
      </div>
      <p className="datos__nota">
        Exporta una copia de vez en cuando: Safari/iOS puede borrar los datos tras unos 7 días sin uso.
      </p>
      {confirmarBorrado && (
        <div className="datos__confirmacion">
          <p>¿Borrar todas las predicciones y observaciones de este navegador?</p>
          <div className="datos__botones">
            <button className="boton boton--control datos__peligro"
              disabled={deshabilitado}
              onClick={() =>
                void ejecutar(async () => {
                  await borrar();
                  setConfirmarBorrado(false);
                  setMensaje('Historial borrado.');
                })
              }
            >
              Confirmar borrado
            </button>
            <button className="boton boton--control" disabled={ocupado}
              onClick={() => setConfirmarBorrado(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {mensaje && <p className="datos__mensaje" role="status">{mensaje}</p>}
      {error && <p className="datos__mensaje datos__mensaje--error" role="alert">{error}</p>}
    </section>
  );
}
