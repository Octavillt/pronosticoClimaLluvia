import { config } from '../config';
import { etiquetaHorizonte, type ResumenExactitud } from '../services/verificacion';
import type { EstadoVerificacion } from './useVerificacion';
import { GestionHistorial } from './GestionHistorial';
import './PanelExactitud.css';

type Props = Pick<EstadoVerificacion, 'resumen' | 'disponible' | 'exportar' | 'importar' | 'borrar'> & {
  conGestion?: boolean;
};

const porcentaje = (p: number) => `${Math.round(p * 100)} %`;
const puntaje = (b: number) => b.toFixed(3);

function ContadoresExactitud({ resumen }: { resumen: ResumenExactitud }) {
  return (
    <>
      <dl className="panel__contadores">
        <div className="panel__mosaico">
          <dt>Observaciones</dt>
          <dd data-testid="exactitud-observaciones">{resumen.observaciones}</dd>
        </div>
        <div className="panel__mosaico">
          <dt>Horas verificadas</dt>
          <dd data-testid="exactitud-horas">{resumen.horasVerificadas}</dd>
        </div>
        <div className="panel__mosaico">
          <dt>Horas con datos insuficientes</dt>
          <dd data-testid="exactitud-insuficientes">{resumen.horasInsuficientes}</dd>
        </div>
        <div className="panel__mosaico">
          <dt>Pares verificados</dt>
          <dd data-testid="exactitud-pares">{resumen.pares}</dd>
        </div>
      </dl>
      <p className="panel__nota">
        Insuficientes: se necesitan al menos {config.verificacion.ventanasMinimasPorHora} ventanas
        distintas de {config.verificacion.ventanaMin} min observadas en la hora, tanto si llueve como si no.
      </p>
      <p className="panel__nota">
        Tres ventanas no cubren la hora completa: puede faltar lluvia posterior. El radar es un proxy,
        no un pluviómetro.
      </p>
    </>
  );
}

function ResumenBrier({ resumen }: { resumen: ResumenExactitud }) {
  const global = resumen.global;
  if (!global) {
    return (
      <p className="panel__texto">
        Aún no hay pares verificados. Registra observaciones y espera a que las horas terminen para
        comparar el pronóstico con lo ocurrido.
      </p>
    );
  }

  return (
    <>
      <h3 className="panel__subtitulo">¿Qué tan acertado fue el pronóstico?</h3>
      <p className="panel__texto">
        Brier (menor es mejor; 0 es perfecto): mezcla {puntaje(global.brier)}, ensamble solo{' '}
        {puntaje(global.brierEnsamble)}, climatología {puntaje(global.brierClimatologia)}.
      </p>
      {resumen.skill === null ? (
        <p className="panel__texto">
          Skill no calculable: la muestra contiene solo horas secas o solo horas con lluvia.
        </p>
      ) : (
        <p className="panel__texto">
          Skill: {puntaje(resumen.skill)}; {Math.abs(resumen.skill * 100).toFixed(1)} %{' '}
          {resumen.skill > 0 ? 'mejor' : resumen.skill < 0 ? 'peor' : 'de diferencia'} que decir siempre{' '}
          {porcentaje(global.frecuencia)} de probabilidad.
        </p>
      )}
      {resumen.pares < 30 && (
        <p className="panel__texto">
          La muestra es pequeña (menos de 30 pares): el resultado aún no es concluyente.
        </p>
      )}
      <p className="panel__nota">
        Se evalúa la PoP emitida sin calibrar. La climatología es la frecuencia de lluvia de esta
        muestra local.
      </p>
    </>
  );
}

function AporteRadar({ radar }: { radar: ResumenExactitud['conRadar'] }) {
  return (
    <>
      <h3 className="panel__subtitulo">Aporte del radar</h3>
      {!radar ? (
        <p className="panel__texto">
          Aún no hay pares verificados en horas donde el radar tenía un peso significativo.
        </p>
      ) : (
        <>
          <p className="panel__texto">
            En {radar.n} pares donde pesaba el radar: Brier con radar {puntaje(radar.brier)} frente a{' '}
            {puntaje(radar.brierEnsamble)} sin radar (ensamble solo), sobre las mismas horas.
          </p>
          {radar.n < 30 && (
            <p className="panel__texto">
              La muestra del radar es pequeña (menos de 30 pares): su aporte aún no es concluyente.
            </p>
          )}
        </>
      )}
    </>
  );
}

function TablaHorizontes({ filas }: { filas: ResumenExactitud['porHorizonte'] }) {
  return (
    <div className="panel__tabla-caja">
      <table className="panel__tabla">
        <caption>Resultados por horizonte</caption>
        <thead>
          <tr>
            <th scope="col">Horizonte</th>
            <th scope="col">Horas verificadas (n)</th>
            <th scope="col">Frecuencia</th>
            <th scope="col">Brier mezcla</th>
            <th scope="col">Brier ensamble</th>
            <th scope="col">Calibración</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.horizonteH}>
              <th scope="row">{etiquetaHorizonte(fila.horizonteH)}</th>
              <td>{fila.n}</td>
              <td>{porcentaje(fila.frecuencia)}</td>
              <td>{puntaje(fila.brier)}</td>
              <td>{puntaje(fila.brierEnsamble)}</td>
              <td className="panel__calibracion">
                {fila.faltan === 0 ? 'Calibrado' : `Faltan ${fila.faltan} pares`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagramaConfiabilidad({ cajas }: { cajas: ResumenExactitud['confiabilidad'] }) {
  const maxN = Math.max(1, ...cajas.map((b) => b.n));

  return (
    <>
      <svg
        role="img"
        aria-label="Confiabilidad: probabilidad emitida frente a frecuencia de lluvia observada"
        viewBox="0 0 400 300"
        className="panel__grafica"
      >
        <line className="panel__eje" x1="60" y1="250" x2="350" y2="250" />
        <line className="panel__eje" x1="60" y1="250" x2="60" y2="30" />
        <line className="panel__diagonal" x1="60" y1="250" x2="350" y2="30">
          <title>Referencia: frecuencia igual a probabilidad</title>
        </line>
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <text className="panel__etiqueta-eje" x={60 + p * 290} y="270" textAnchor="middle">
              {porcentaje(p)}
            </text>
            <text className="panel__etiqueta-eje" x="52" y={254 - p * 220} textAnchor="end">
              {porcentaje(p)}
            </text>
          </g>
        ))}
        <text className="panel__etiqueta-eje" x="205" y="295" textAnchor="middle">
          PoP media emitida
        </text>
        <text className="panel__etiqueta-eje" transform="translate(14 140) rotate(-90)" textAnchor="middle">
          Frecuencia observada
        </text>
        {cajas.map((b) => (
          <circle
            key={b.desde}
            cx={60 + b.popMedia * 290}
            cy={250 - b.frecuencia * 220}
            r={3 + 9 * Math.sqrt(b.n / maxN)}
            className="panel__punto"
          >
            <title>
              Caja {porcentaje(b.desde)}–{porcentaje(b.hasta)}: {b.n} pares, PoP media{' '}
              {porcentaje(b.popMedia)}, frecuencia {porcentaje(b.frecuencia)}
            </title>
          </circle>
        ))}
      </svg>
      <p className="panel__nota">
        La diagonal indica una probabilidad bien calibrada; el tamaño de cada punto representa la
        cantidad de pares.
      </p>
      <div className="panel__tabla-caja">
        <table className="panel__tabla">
          <caption>Datos de confiabilidad</caption>
          <thead>
            <tr>
              <th scope="col">Caja de PoP</th>
              <th scope="col">Pares</th>
              <th scope="col">PoP media</th>
              <th scope="col">Frecuencia</th>
            </tr>
          </thead>
          <tbody>
            {cajas.map((b) => (
              <tr key={b.desde}>
                <th scope="row">{porcentaje(b.desde)}–{porcentaje(b.hasta)}</th>
                <td>{b.n}</td>
                <td>{porcentaje(b.popMedia)}</td>
                <td>{porcentaje(b.frecuencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PanelExactitud({
  resumen, disponible, exportar, importar, borrar, conGestion = true,
}: Props) {
  return (
    <section aria-label="Panel de Exactitud" className="panel">
      {!disponible ? (
        <div className="tarjeta panel__tarjeta">
          <h2 className="panel__titulo">Exactitud del pronóstico</h2>
          <p className="panel__aviso">
            El almacenamiento local no está disponible. El pronóstico sigue funcionando sin historial
            ni calibración.
          </p>
        </div>
      ) : !resumen ? (
        <div className="tarjeta panel__tarjeta">
          <h2 className="panel__titulo">Exactitud del pronóstico</h2>
          <p className="panel__aviso">Cargando historial local…</p>
        </div>
      ) : (
        <>
          <div className="tarjeta panel__tarjeta">
            <h2 className="panel__titulo">Exactitud del pronóstico</h2>
            <ContadoresExactitud resumen={resumen} />
            <ResumenBrier resumen={resumen} />
            <AporteRadar radar={resumen.conRadar} />
          </div>
          {resumen.porHorizonte.length > 0 && (
            <div className="tarjeta panel__tarjeta">
              <h2 className="panel__titulo panel__titulo--chico">Por horizonte</h2>
              <TablaHorizontes filas={resumen.porHorizonte} />
            </div>
          )}
          {resumen.confiabilidad.length > 0 && (
            <div className="tarjeta panel__tarjeta">
              <h2 className="panel__titulo panel__titulo--chico">Confiabilidad</h2>
              <DiagramaConfiabilidad cajas={resumen.confiabilidad} />
            </div>
          )}
        </>
      )}
      {conGestion && (
        <GestionHistorial
          resumen={resumen}
          disponible={disponible}
          exportar={exportar}
          importar={importar}
          borrar={borrar}
        />
      )}
    </section>
  );
}
