interface PartesDia {
  anio: number;
  mes: number;
  dia: number;
}

/** Fecha local del instante en la zona, como partes numéricas: no depende del formato del locale. */
function partesDia(ms: number, tz: string): PartesDia {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { anio: valor('year'), mes: valor('month'), dia: valor('day') };
}

/** Medianoche UTC del día local: comparable entre sí aunque las zonas difieran. */
function medianocheDelDiaLocal(ms: number, tz: string): number {
  const { anio, mes, dia } = partesDia(ms, tz);
  return Date.UTC(anio, mes - 1, dia);
}

export function claveDia(ms: number, tz: string): string {
  const { anio, mes, dia } = partesDia(ms, tz);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Días de calendario locales entre los dos instantes; cuentan días de 23 y de 25 horas como un día. */
export function diasDeDiferencia(ms: number, ahoraMs: number, tz: string): number {
  return Math.round((medianocheDelDiaLocal(ms, tz) - medianocheDelDiaLocal(ahoraMs, tz)) / 86_400_000);
}

export function etiquetaDia(ms: number, ahoraMs: number, tz: string): string {
  const dias = diasDeDiferencia(ms, ahoraMs, tz);
  if (dias === 0) {
    return 'hoy';
  }
  if (dias === 1) {
    return 'mañana';
  }
  if (dias === 2) {
    return 'pasado mañana';
  }
  return new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'long' })
    .format(new Date(ms))
    .toLowerCase();
}
