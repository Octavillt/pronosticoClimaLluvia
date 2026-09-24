export const config = {
  appName: 'SistemaClima',
  urls: {
    ensemble: 'https://ensemble-api.open-meteo.com/v1/ensemble',
    forecast: 'https://api.open-meteo.com/v1/forecast',
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  },
  googleWeatherKey: import.meta.env.VITE_GOOGLE_WEATHER_KEY ?? '',
} as const;
