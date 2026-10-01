export const ZONA_PREDETERMINADA = 'America/Mexico_City';

export function normalizarZona(zona: unknown): string | null {
  if (typeof zona !== 'string' || !zona.startsWith('America/')) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: zona });
  } catch {
    return null;
  }
  return zona;
}

export function formatHoraLocal(isoUtc: string, timeZone?: string): string {
  const fecha = new Date(isoUtc);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Fecha inválida: ${isoUtc}`);
  }
  const opciones: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    // h23: la medianoche debe salir "00:00"; con hour12:false algunos motores la formatean "24:00".
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  };
  return new Intl.DateTimeFormat('es-MX', opciones).format(fecha);
}
