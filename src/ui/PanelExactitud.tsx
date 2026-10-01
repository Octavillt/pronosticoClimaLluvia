import type { CSSProperties } from 'react';
import { config } from '../config';
import { etiquetaHorizonte, type ResumenExactitud } from '../services/verificacion';
import type { EstadoVerificacion } from './useVerificacion';
import { GestionHistorial } from './GestionHistorial';

type Props = Pick<EstadoVerificacion, 'resumen' | 'disponible' | 'exportar' | 'importar' | 'borrar'> & {
  conGestion?: boolean;
};

const tabla: CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  fontSize: '0.78rem',
  overflowWrap: 'anywhere',
};
const nota: CSSProperties = { fontSize: '0.85rem' };
const contador: CSSProperties = { margin: 0 };
const porcentaje = (p: number) => `${Math.round(p * 100)} %`;
const puntaje = (b: number) => b.toFixed(3);

function ContadoresExactitud({ resumen }: { resumen: ResumenExactitud }) {
  return (
    <>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
        <dt>Observaciones</dt>
        <dd style={contador} data-testid="exactitud-observaciones">
          {resumen.observaciones}
        </dd>
        <dt>Horas verificadas</dt>
        <dd style={contador} data-testid="exactitud-horas">
          {resumen.horasVerificadas}
        </dd>
        <dt>Horas con datos insuficientes</dt>
        <dd style={contador} data-testid="exactitud-insuficientes">
          {resumen.horasInsuficientes}
        </dd>
        <dt>Pares verificados</dt>
        <dd style={contador} data-testid="exactitud-pares">
          {resumen.pares}
        </dd>
      </dl>
      <p style={nota}>
        Insuficientes: se necesitan al menos {config.verificacion.ventanasMinimasPorHora} ventanas
        distintas de {config.verificacion.ventanaMin} min observadas en la hora, tanto si llueve como si no.
      </p>
      <p style={nota}>
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
      <p>
        Aún no hay pares verificados. Registra observaciones y espera a que las horas terminen para
        comparar el pronóstico con lo ocurrido.
      </p>
    );
  }

  return (
    <>
      <h3>¿Qué tan acertado fue el pronóstico?</h3>
      <p>
        Brier (menor es mejor; 0 es perfecto): mezcla {puntaje(global.brier)}, ensamble solo{' '}
        {puntaje(global.brierEnsamble)}, climatología {puntaje(global.brierClimatologia)}.
      </p>
      {resumen.skill === null ? (
        <p>Skill no calculable: la muestra contiene solo horas secas o solo horas con lluvia.</p>
      ) : (
        <p>
          Skill: {puntaje(resumen.skill)}; {Math.abs(resumen.skill * 100).toFixed(1)} %{' '}
          {resumen.skill > 0 ? 'mejor' : resumen.skill < 0 ? 'peor' : 'de diferencia'} que decir siempre{' '}
          {porcentaje(global.frecuencia)} de probabilidad.
        </p>
      )}
      {resumen.pares < 30 && (
        <p>La muestra es pequeña (menos de 30 pares): el resultado aún no es concluyente.</p>
      )}
      <p style={nota}>
        Se evalúa la PoP emitida sin calibrar. La climatología es la frecuencia de lluvia de esta
        muestra local.
      </p>
    </>
  );
}

function AporteRadar({ radar }: { radar: ResumenExactitud['conRadar'] }) {
  return (
    <>
      <h3>Aporte del radar</h3>
      {!radar ? (
        <p>Aún no hay pares verificados en horas donde el radar tenía un peso significativo.</p>
      ) : (
        <>
          <p>
            En {radar.n} pares donde pesaba el radar: Brier con radar {puntaje(radar.brier)} frente a{' '}
            {puntaje(radar.brierEnsamble)} sin radar (ensamble solo), sobre las mismas horas.
          </p>
          {radar.n < 30 && (
            <p>La muestra del radar es pequeña (menos de 30 pares): su aporte aún no es concluyente.</p>
          )}
        </>
      )}
    </>
  );
}

function TablaHorizontes({ filas }: { filas: ResumenExactitud['porHorizonte'] }) {
  return (
    <table style={tabla}>
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
            <td>{fila.faltan === 0 ? 'Calibrado' : `Faltan ${fila.faltan} pares`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DiagramaConfiabilidad({ cajas }: { cajas: ResumenExactitud['confiabilidad'] }) {
  const maxN = Math.max(1, ...cajas.map((b) => b.n));

  return (
    <>
      <h3>Confiabilidad</h3>
      <svg
        role="img"
        aria-label="Confiabilidad: probabilidad emitida frente a frecuencia de lluvia observada"
        viewBox="0 0 400 300"
        style={{ width: '100%', maxWidth: 500 }}
      >
        <line x1="60" y1="250" x2="350" y2="250" stroke="#555" />
        <line x1="60" y1="250" x2="60" y2="30" stroke="#555" />
        <line x1="60" y1="250" x2="350" y2="30" stroke="#888" strokeDasharray="5 4">
          <title>Referencia: frecuencia igual a probabilidad</title>
        </line>
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <text x={60 + p * 290} y="270" textAnchor="middle" fontSize="12">
              {porcentaje(p)}
            </text>
            <text x="52" y={254 - p * 220} textAnchor="end" fontSize="12">
              {porcentaje(p)}
            </text>
          </g>
        ))}
        <text x="205" y="295" textAnchor="middle" fontSize="12">
          PoP media emitida
        </text>
        <text transform="translate(14 140) rotate(-90)" textAnchor="middle" fontSize="12">
          Frecuencia observada
        </text>
        {cajas.map((b) => (
          <circle
            key={b.desde}
            cx={60 + b.popMedia * 290}
            cy={250 - b.frecuencia * 220}
            r={3 + 9 * Math.sqrt(b.n / maxN)}
            fill="#2563eb"
          >
            <title>
              Caja {porcentaje(b.desde)}–{porcentaje(b.hasta)}: {b.n} pares, PoP media{' '}
              {porcentaje(b.popMedia)}, frecuencia {porcentaje(b.frecuencia)}
            </title>
          </circle>
        ))}
      </svg>
      <p style={nota}>
        La diagonal indica una probabilidad bien calibrada; el tamaño de cada punto representa la
        cantidad de pares.
      </p>
      <table style={tabla}>
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
    </>
  );
}

export function PanelExactitud({ resumen, disponible, exportar, importar, borrar, conGestion = true }: Props) {
  return (
    <section aria-label="Panel de Exactitud" style={{ margin: '24px 0', borderTop: '1px solid #ddd' }}>
      <h2>Panel de Exactitud</h2>
      {!disponible ? (
        <p>
          El almacenamiento local no está disponible. El pronóstico sigue funcionando sin historial
          ni calibración.
        </p>
      ) : !resumen ? (
        <p>Cargando historial local…</p>
      ) : (
        <>
          <ContadoresExactitud resumen={resumen} />
          <ResumenBrier resumen={resumen} />
          <AporteRadar radar={resumen.conRadar} />
          {resumen.porHorizonte.length > 0 && <TablaHorizontes filas={resumen.porHorizonte} />}
          {resumen.confiabilidad.length > 0 && <DiagramaConfiabilidad cajas={resumen.confiabilidad} />}
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
