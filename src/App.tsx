import { config } from './config';
import { formatHoraLocal } from './utils/localTime';

export default function App() {
  return (
    <main>
      <h1>{config.appName}</h1>
      <p>Probabilidad de lluvia calibrada para México. En construcción (Fase 0).</p>
      <p>
        Hora local: <time dateTime={new Date().toISOString()}>{formatHoraLocal(new Date().toISOString())}</time>
      </p>
    </main>
  );
}
