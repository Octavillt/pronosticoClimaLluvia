export function formatHoraLocal(isoUtc: string, timeZone?: string): string {
  const fecha = new Date(isoUtc);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Fecha inválida: ${isoUtc}`);
  }
  const opciones: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  };
  return new Intl.DateTimeFormat('es-MX', opciones).format(fecha);
}
