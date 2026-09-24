export const MODELOS_PRUEBA = [
  'ecmwf_ifs025',
  'ecmwf_aifs025',
  'ncep_gefs_seamless',
  'icon_global_eps',
  'gem_global_ensemble',
] as const;

export const MIEMBROS_POR_MODELO: Record<(typeof MODELOS_PRUEBA)[number], number> = {
  ecmwf_ifs025: 51,
  ecmwf_aifs025: 51,
  ncep_gefs_seamless: 31,
  icon_global_eps: 40,
  gem_global_ensemble: 21,
};

export function horasUtcPrueba(numHoras = 72, inicio = '2026-09-24T00:00'): string[] {
  const base = new Date(`${inicio}Z`).getTime();
  return Array.from({ length: numHoras }, (_, i) =>
    new Date(base + i * 3_600_000).toISOString().slice(0, 16),
  );
}

export function ensambleFixture(
  opciones: {
    modelos?: readonly string[];
    numHoras?: number;
    precipitacion?: (miembro: number, hora: number) => number;
  } = {},
) {
  const modelos = opciones.modelos ?? MODELOS_PRUEBA;
  const horas = horasUtcPrueba(opciones.numHoras ?? 72);
  const precip = opciones.precipitacion ?? (() => 0);
  const hourly: Record<string, unknown> = { time: horas };
  for (const modelo of modelos) {
    const total = MIEMBROS_POR_MODELO[modelo as (typeof MODELOS_PRUEBA)[number]] ?? 10;
    for (let m = 0; m < total; m += 1) {
      const serie = horas.map((_, h) => precip(m, h));
      const clave =
        m === 0
          ? `precipitation_${modelo}`
          : `precipitation_member${String(m).padStart(2, '0')}_${modelo}`;
      hourly[clave] = serie;
    }
  }
  return { latitude: 19.43, longitude: -99.13, hourly };
}

export function forecastFixture(numHoras = 72) {
  return {
    latitude: 19.43,
    longitude: -99.13,
    timezone: 'America/Mexico_City',
    hourly: {
      time: horasUtcPrueba(numHoras),
      temperature_2m: Array.from({ length: numHoras }, () => 20),
      precipitation: Array.from({ length: numHoras }, () => 0),
      weather_code: Array.from({ length: numHoras }, () => 1),
    },
  };
}
