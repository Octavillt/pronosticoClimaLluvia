import './Radar.css';

export function RadarEsqueleto() {
  return (
    <section className="tarjeta radar" aria-label="Mapa de radar" aria-busy="true">
      <div className="radar__cabecera">
        <h2 className="radar__titulo">Radar</h2>
      </div>
      <div className="radar__esqueleto" aria-hidden="true" />
    </section>
  );
}
